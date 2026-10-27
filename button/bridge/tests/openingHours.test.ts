import { describe, expect, it } from "vitest";
import { isOpen, type OpeningHours } from "../src/openingHours.js";

const WED_TO_SUN_NOON_TO_FOUR: OpeningHours = { days: ["wed", "thu", "fri", "sat", "sun"], from: "12:00", to: "16:00" };

describe("isOpen", () => {
  // 2026-09-16 is a Wednesday; Stockholm is UTC+2 in September.
  it.each([
    ["Wednesday 12:00 Stockholm, opening", "2026-09-16T10:00:00Z", true],
    ["Wednesday 11:59 Stockholm", "2026-09-16T09:59:00Z", false],
    ["Wednesday 15:59 Stockholm", "2026-09-16T13:59:00Z", true],
    ["Wednesday 16:00 Stockholm, closing", "2026-09-16T14:00:00Z", false],
    ["Tuesday 13:00 Stockholm, closed day", "2026-09-15T11:00:00Z", false],
    ["Sunday 13:00 Stockholm", "2026-09-20T11:00:00Z", true],
  ])("%s → %s", (_name, at, open) => {
    expect(isOpen(WED_TO_SUN_NOON_TO_FOUR, "Europe/Stockholm", Date.parse(at))).toBe(open);
  });

  it("reads the day in the venue's zone, not UTC", () => {
    // 23:30 UTC Tuesday is already 01:30 Wednesday in Stockholm.
    const lateTuesdayUtc = Date.parse("2026-09-15T23:30:00Z");
    const allDayWednesday: OpeningHours = { days: ["wed"], from: "00:00", to: "23:59" };
    expect(isOpen(allDayWednesday, "Europe/Stockholm", lateTuesdayUtc)).toBe(true);
    expect(isOpen(allDayWednesday, "UTC", lateTuesdayUtc)).toBe(false);
  });
});
