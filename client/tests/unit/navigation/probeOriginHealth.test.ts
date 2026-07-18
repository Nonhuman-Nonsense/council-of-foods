import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_PROBE_TIMEOUT_MS, probeOriginHealth } from "@/navigation";

function fetchRejectingOnAbort(status = 200) {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
      resolve(new Response("", { status }));
    }),
  );
}

describe("probeOriginHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns true on HTTP 200", async () => {
    vi.stubGlobal("fetch", fetchRejectingOnAbort(200));

    await expect(probeOriginHealth()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith("/health", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns false on HTTP 503", async () => {
    vi.stubGlobal("fetch", fetchRejectingOnAbort(503));

    await expect(probeOriginHealth()).resolves.toBe(false);
  });

  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(probeOriginHealth()).resolves.toBe(false);
  });

  it("returns false on probe timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const probe = probeOriginHealth();
    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS);

    await expect(probe).resolves.toBe(false);
  });
});
