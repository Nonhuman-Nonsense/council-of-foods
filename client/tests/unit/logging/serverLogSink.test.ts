import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushServerLog,
  getServerLogStatus,
  MAX_QUEUED_LINES,
  pushServerLogLine,
  resetServerLogSinkForTests,
  SERVER_LOG_ERROR_FLUSH_MS,
  SERVER_LOG_FLUSH_MS,
  SERVER_LOG_RETRY_MS,
  setLogContext,
} from "@/logging/serverLogSink";
import { CLIENT_LOG_LIMITS, type ClientLogBatch } from "@shared/ClientLogTypes";

const settings = vi.hoisted(() => ({ logging: true, venueId: "museum-oslo" }));

vi.mock("@/settings/councilSettings", () => ({
  getDevLogEnabled: () => settings.logging,
  getVenueId: () => settings.venueId,
}));

const fetchMock = vi.fn();

function sentBatches(): ClientLogBatch[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as ClientLogBatch);
}

describe("serverLogSink", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    settings.logging = true;
    settings.venueId = "museum-oslo";
    resetServerLogSinkForTests();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends the lines logged within a few seconds as one batch, tagged with the visit", async () => {
    setLogContext({ setupId: "setup-1" });
    pushServerLogLine("TURN", "IN response.created", { reason: "greeting" });
    pushServerLogLine("REALTIME", "audio stats");

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/client-log");
    const [sent] = sentBatches();
    expect(sent).toMatchObject({ seq: 0, venueId: "museum-oslo" });
    expect(sent.pageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.lines.map((line) => [line.cat, line.msg, line.ctx])).toEqual([
      ["TURN", "IN response.created", { setupId: "setup-1" }],
      ["REALTIME", "audio stats", { setupId: "setup-1" }],
    ]);
    expect(sent.lines[0].data).toEqual({ reason: "greeting" });
  });

  it("sends an error, and what led up to it, without waiting for the next batch", async () => {
    pushServerLogLine("TURN", "IN speech_stopped");
    pushServerLogLine("ERROR", "STALL no-answer");

    await vi.advanceTimersByTimeAsync(SERVER_LOG_ERROR_FLUSH_MS);

    expect(sentBatches().flatMap((batch) => batch.lines.map((line) => line.msg))).toEqual([
      "IN speech_stopped",
      "STALL no-answer",
    ]);
  });

  it("splits a backlog into batches the server will accept", async () => {
    const bulky = { text: "x".repeat(4_000) };
    for (let i = 0; i < 40; i++) pushServerLogLine("TURN", `line ${i}`, bulky);

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS + 10 * SERVER_LOG_ERROR_FLUSH_MS);

    const batches = sentBatches();
    expect(batches.length).toBeGreaterThan(1);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new TextEncoder().encode((init as RequestInit).body as string).length).toBeLessThanOrEqual(
        CLIENT_LOG_LIMITS.maxBatchBytes,
      );
    }
    expect(batches.map((batch) => batch.seq)).toEqual(batches.map((_, i) => i));
    expect(batches.flatMap((batch) => batch.lines).length).toBe(40);
  });

  it("keeps lines while the server is unreachable and sends them once it is back", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    pushServerLogLine("TURN", "first");

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS);
    expect(getServerLogStatus()).toMatchObject({ failure: "network", pending: 1 });

    await vi.advanceTimersByTimeAsync(SERVER_LOG_RETRY_MS);

    expect(sentBatches().at(-1)?.lines.map((line) => line.msg)).toEqual(["first"]);
    expect(getServerLogStatus()).toMatchObject({ failure: null, pending: 0, sentLines: 1 });
  });

  it("drops the oldest lines past its cap and says how many were lost", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    for (let i = 0; i < MAX_QUEUED_LINES + 3; i++) pushServerLogLine("TURN", `line ${i}`);

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS + SERVER_LOG_RETRY_MS);

    const [, retried] = sentBatches();
    expect(retried.dropped).toBe(3);
    expect(retried.lines[0].msg).toBe("line 3");
  });

  it("does not resend lines the server refused", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    pushServerLogLine("TURN", "refused");

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS);
    await flushServerLog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getServerLogStatus()).toMatchObject({ failure: "400", pending: 0 });
  });

  it("collects nothing while logging is off", async () => {
    settings.logging = false;
    pushServerLogLine("ERROR", "STALL no-answer");

    await vi.advanceTimersByTimeAsync(SERVER_LOG_FLUSH_MS);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getServerLogStatus().pending).toBe(0);
  });
});
