import { describe, expect, it } from "vitest";
import { detectAttention } from "../src/printAttention.js";
import type { PrinterStatus } from "../src/printer.js";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const MINUTE = 60_000;

function printer(overrides: Partial<PrinterStatus> = {}): PrinterStatus {
  return {
    name: "Museum_Printer",
    state: "idle",
    alerts: [],
    message: null,
    queuedJobs: 0,
    oldestJobAt: null,
    ...overrides,
  };
}

describe("detectAttention", () => {
  it.each([
    { name: "a healthy idle printer", printer: printer(), waiting: null, expected: null },
    { name: "before CUPS has been asked", printer: null, waiting: null, expected: null },
    { name: "no default printer", printer: printer({ name: null }), waiting: null, expected: "no-printer" },
    { name: "out of paper", printer: printer({ alerts: ["media-empty-error"] }), waiting: null, expected: "media-empty" },
    { name: "a jam among other reasons", printer: printer({ alerts: ["toner-low-warning", "media-jam-error"] }), waiting: null, expected: "media-jam" },
    { name: "only a low-toner warning", printer: printer({ alerts: ["toner-low-warning"] }), waiting: null, expected: null },
    { name: "only CUPS bookkeeping", printer: printer({ alerts: ["cups-waiting-for-job-completed"] }), waiting: null, expected: null },
    { name: "switched off with nothing to print", printer: printer({ alerts: ["offline-report"] }), waiting: null, expected: null },
    { name: "switched off with a protocol waiting", printer: printer({ alerts: ["offline-report"] }), waiting: NOW - MINUTE, expected: "offline" },
    { name: "a paused queue", printer: printer({ state: "stopped" }), waiting: null, expected: "stopped" },
    { name: "a protocol waiting a little", printer: printer(), waiting: NOW - 9 * MINUTE, expected: null },
    { name: "a protocol waiting too long, printer silent", printer: printer(), waiting: NOW - 10 * MINUTE, expected: "not-printing" },
  ])("$name → $expected", ({ printer: status, waiting, expected }) => {
    const result = detectAttention({
      printer: status,
      oldestWaitingAt: waiting,
      now: NOW,
      notPrintingAfterMs: 10 * MINUTE,
    });
    expect(result?.reason ?? null).toBe(expected);
  });

  it("dates a stuck queue from the oldest waiting protocol", () => {
    const waiting = NOW - 25 * MINUTE;
    expect(
      detectAttention({ printer: printer(), oldestWaitingAt: waiting, now: NOW, notPrintingAfterMs: 10 * MINUTE }),
    ).toEqual({ reason: "not-printing", since: waiting });
  });
});
