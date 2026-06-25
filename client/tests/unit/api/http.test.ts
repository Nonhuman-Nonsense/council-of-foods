import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { councilFetch } from "@api/http";
import { log } from "@/logger";

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

  it("logs OUT and IN under vitest noop without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await councilFetch("/api/meetings/1");

    expect(log.event).toHaveBeenCalledWith("API", "OUT GET /api/meetings/1");
    expect(log.event).toHaveBeenCalledWith(
      "API",
      "IN GET /api/meetings/1 404",
      { ok: false },
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
