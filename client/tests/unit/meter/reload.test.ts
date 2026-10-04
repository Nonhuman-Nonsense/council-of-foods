import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_RETRY_MS } from "@/health";
import { msUntilNightlyReload, NIGHTLY_RELOAD_HOUR, reloadWhenHealthy } from "@/meter/reload";

describe("nightly reload", () => {
  it.each([
    { name: "later the same night", now: new Date(2026, 9, 3, 1, 30), date: 3 },
    { name: "the next night, once past", now: new Date(2026, 9, 3, 15, 0), date: 4 },
    { name: "the next night, at the hour itself", now: new Date(2026, 9, 3, NIGHTLY_RELOAD_HOUR, 0), date: 4 },
    { name: "the night the clocks go back", now: new Date(2026, 9, 24, 22, 0), date: 25 },
  ])("falls $name", ({ now, date }) => {
    const at = new Date(now.getTime() + msUntilNightlyReload(now));

    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([date, NIGHTLY_RELOAD_HOUR, 0]);
  });
});

describe("reloadWhenHealthy", () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockReset();
    Object.defineProperty(window, "location", { value: { ...originalLocation, reload }, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
  });

  it("waits for the server to answer before reloading", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    void reloadWhenHealthy();
    await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
