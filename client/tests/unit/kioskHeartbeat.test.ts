import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_MS, startKioskHeartbeat } from "@/kioskHeartbeat";

describe("kiosk heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = "Council of Forest";
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("ticks the title while on, and gives the page its own title back when off", () => {
    let on = true;
    startKioskHeartbeat(() => on);

    const titles: string[] = [];
    for (const next of [true, true, false, true]) {
      on = next;
      vi.advanceTimersByTime(HEARTBEAT_MS);
      titles.push(document.title);
    }

    expect(titles).toEqual([
      "Council of Forest · 1",
      "Council of Forest · 2",
      "Council of Forest",
      "Council of Forest · 3",
    ]);
  });
});
