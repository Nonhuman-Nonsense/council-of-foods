import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { councilFetch } from "@api/http";
import { log } from "@/logger";
import * as councilSettings from "@/settings/councilSettings";

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

    await expect(councilFetch("/api/meetings")).rejects.toThrow("Failed to fetch");
    expect(log.event).toHaveBeenCalledWith(
      "ERROR",
      "API GET /api/meetings network error",
      networkError,
    );
  });
});
