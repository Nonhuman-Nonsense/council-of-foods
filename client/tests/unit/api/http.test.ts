import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { councilFetch, NETWORK_RETRY_DELAYS_MS } from "@api/http";
import { log } from "@/logger";
import * as councilSettings from "@/settings/councilSettings";
import { OWN_CLIENT_HEADER, OWN_CLIENT_VALUE } from "@shared/ownClient";

describe("councilFetch", () => {
  beforeEach(() => {
    vi.spyOn(log, "event").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delegates to fetch and returns the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await councilFetch("/api/meetings", { method: "POST" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/meetings",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // The server reports a request it rejects only when our own client sent it.
  it.each([
    { name: "no headers", headers: undefined },
    { name: "a plain object", headers: { Authorization: "Bearer k" } },
    { name: "a Headers instance", headers: new Headers({ Authorization: "Bearer k" }) },
    { name: "header pairs", headers: [["Authorization", "Bearer k"]] as [string, string][] },
  ])("marks the request as our own client's, with $name", async ({ headers }) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await councilFetch("/api/meetings/1", { headers });

    const sent = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(sent.get(OWN_CLIENT_HEADER)).toBe(OWN_CLIENT_VALUE);
    if (headers) expect(sent.get("Authorization")).toBe("Bearer k");
  });

  it("logs request and response bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "clip-1", audioBase64: "Y".repeat(500) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await councilFetch("/api/audio/clip-1", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    expect(log.event).toHaveBeenCalledWith(
      "API",
      "OUT GET /api/audio/clip-1",
      undefined,
    );
    expect(log.event).toHaveBeenCalledWith(
      "API",
      "IN GET /api/audio/clip-1 200",
      expect.objectContaining({
        ok: true,
        body: expect.objectContaining({
          id: "clip-1",
          audioBase64: expect.stringContaining("[audioBase64"),
        }),
      }),
    );
  });

  it("logs POST request JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await councilFetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: "forests", humanName: "Ada" }),
    });

    expect(log.event).toHaveBeenCalledWith(
      "API",
      "OUT POST /api/meetings",
      { body: { topicId: "forests", humanName: "Ada" } },
    );
  });

  it("warns on non-ok HTTP when API structured logging is disabled", async () => {
    vi.spyOn(councilSettings, "getDevLogEnabled").mockReturnValue(false);
    vi.spyOn(councilSettings, "isDevLogCategoryEnabled").mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await councilFetch("/api/meetings/99");

    expect(res.status).toBe(404);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Council] HTTP GET /api/meetings/99 404",
      expect.objectContaining({ message: "not found" }),
    );
  });

  it("logs ERROR and rethrows on network failure", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    await expect(councilFetch("/api/meetings", { method: "POST" })).rejects.toThrow("Failed to fetch");
    expect(log.event).toHaveBeenCalledWith(
      "ERROR",
      "API POST /api/meetings network error",
      networkError,
    );
  });

  describe("retry when no response came back", () => {
    const ok = () => new Response("{}", { status: 200 });
    const dropped = () => new TypeError("Failed to fetch");
    const allRetries = NETWORK_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Each entry is one attempt: a Response resolves, an Error rejects. */
    function stubFetch(outcomes: Array<Response | Error>) {
      const fetchMock = vi.fn();
      for (const outcome of outcomes) {
        if (outcome instanceof Error) fetchMock.mockRejectedValueOnce(outcome);
        else fetchMock.mockResolvedValueOnce(outcome);
      }
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it.each([
      { name: "a GET that drops once recovers", method: "GET", options: undefined, outcomes: [dropped(), ok()], result: 200, attempts: 2 },
      { name: "a GET that drops every time gives up after the last retry", method: "GET", options: undefined, outcomes: [dropped(), dropped(), dropped(), dropped()], result: "Failed to fetch", attempts: 4 },
      { name: "an HTTP error status is the server's answer, not retried", method: "GET", options: undefined, outcomes: [new Response("", { status: 500 })], result: 500, attempts: 1 },
      { name: "a POST is not retried — it may have reached the server", method: "POST", options: undefined, outcomes: [dropped(), ok()], result: "Failed to fetch", attempts: 1 },
      { name: "a POST that opts in is retried", method: "POST", options: { retryOnNetworkError: true }, outcomes: [dropped(), ok()], result: 200, attempts: 2 },
      { name: "a GET that opts out is not retried", method: "GET", options: { retryOnNetworkError: false }, outcomes: [dropped(), ok()], result: "Failed to fetch", attempts: 1 },
    ] as const)("$name", async ({ method, options, outcomes, result, attempts }) => {
      const fetchMock = stubFetch([...outcomes]);

      const settled = councilFetch("/api/meetings/1", { method }, options).then(
        (res) => res.status,
        (err: Error) => err.message,
      );
      await vi.advanceTimersByTimeAsync(allRetries);

      await expect(settled).resolves.toBe(result);
      expect(fetchMock).toHaveBeenCalledTimes(attempts);
    });

    it("stops retrying once the caller aborts", async () => {
      const fetchMock = stubFetch([dropped(), ok()]);
      const ac = new AbortController();

      const settled = councilFetch("/api/meetings/1", { signal: ac.signal }).catch(
        (err: unknown) => err,
      );
      await vi.advanceTimersByTimeAsync(0);
      ac.abort();
      await vi.advanceTimersByTimeAsync(allRetries);

      expect(await settled).toMatchObject({ name: "AbortError" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
