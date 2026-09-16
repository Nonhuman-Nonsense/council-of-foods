import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetPrintedMeetingsForTests,
  printProtocolOnce,
  sendProtocolToPrinter,
} from "@/museum/print/printClient";

const FAST_RETRY = { retryBaseMs: 1, retryMaxMs: 5, giveUpAfterMs: 50 };
const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });

function reply(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), { status });
}

describe("sending a protocol to the bridge", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    _resetPrintedMeetingsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the PDF to the bridge's print endpoint", async () => {
    fetchMock.mockResolvedValueOnce(reply(202));

    await expect(sendProtocolToPrinter(42, pdf, FAST_RETRY)).resolves.toBe("queued");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8765/v1/print?meetingId=42");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: pdf,
    });
  });

  it("follows a bridge URL override", async () => {
    localStorage.setItem("councilButtonBridgeUrl", "ws://127.0.0.1:9999/v1/button");
    fetchMock.mockResolvedValueOnce(reply(202));

    await sendProtocolToPrinter(42, pdf, FAST_RETRY);

    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:9999/v1/print?meetingId=42");
  });

  it.each([
    {
      name: "an unreachable bridge that comes back",
      replies: [new TypeError("Failed to fetch"), reply(503), reply(202)],
      outcome: "queued",
      calls: 3,
    },
    { name: "an already printed meeting", replies: [reply(200)], outcome: "duplicate", calls: 1 },
    { name: "a job the bridge rejects, without retrying", replies: [reply(400)], outcome: "rejected", calls: 1 },
  ])("$name → $outcome", async ({ replies, outcome, calls }) => {
    for (const next of replies) {
      if (next instanceof Error) fetchMock.mockRejectedValueOnce(next);
      else fetchMock.mockResolvedValueOnce(next);
    }

    await expect(sendProtocolToPrinter(42, pdf, FAST_RETRY)).resolves.toBe(outcome);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("gives up on a bridge that stays unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(sendProtocolToPrinter(42, pdf, FAST_RETRY)).resolves.toBe("gave_up");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("creates and sends each meeting's protocol once per page load", async () => {
    fetchMock.mockResolvedValue(reply(202));
    const createPdf = vi.fn().mockResolvedValue(pdf);

    const first = printProtocolOnce(42, createPdf, FAST_RETRY);
    const again = printProtocolOnce(42, createPdf, FAST_RETRY);
    const other = printProtocolOnce(43, createPdf, FAST_RETRY);

    expect(again).toBeNull();
    await expect(first).resolves.toBe("queued");
    await expect(other).resolves.toBe("queued");
    expect(createPdf).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
