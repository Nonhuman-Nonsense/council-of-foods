import { describe, expect, it } from "vitest";
import {
  INITIAL_ALERT_STATE,
  stepAlerts,
  type AlertState,
  type Attention,
  type AlertKind,
} from "../src/printAlerts.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const timings = { graceMs: 2 * MINUTE, reminderMs: 4 * HOUR, openingReminderGapMs: HOUR };
const paper = (since = 0): Attention => ({ reason: "media-empty", since });
const jam: Attention = { reason: "media-jam", since: 0 };

type Tick = { at: number; attention: Attention; open?: boolean };

/** Runs a timeline and returns what was sent when. `open` defaults to true. */
function run(ticks: Tick[], start: AlertState = INITIAL_ALERT_STATE) {
  let state = start;
  let wasOpen = ticks[0]?.open ?? true;
  const sent: Array<{ at: number; kind: AlertKind; reason: string }> = [];
  for (const { at, attention, open = true } of ticks) {
    const result = stepAlerts(state, attention, { now: at, open, wasOpen, timings });
    state = result.state;
    wasOpen = open;
    if (result.send) sent.push({ at, kind: result.send.kind, reason: result.send.reason });
  }
  return { sent, state };
}

/** A tick every 30 s from `from` to `to`, with the same condition throughout. */
function steady(from: number, to: number, attention: Attention, open = true): Tick[] {
  const ticks: Tick[] = [];
  for (let at = from; at <= to; at += 30_000) ticks.push({ at, attention, open });
  return ticks;
}

describe("printer alerts", () => {
  it("ignores a blip shorter than the grace period", () => {
    expect(run([...steady(0, MINUTE, paper()), ...steady(MINUTE + 30_000, 10 * MINUTE, null)]).sent).toEqual([]);
  });

  it("alerts once a problem outlasts the grace period, then stays quiet", () => {
    expect(run(steady(0, HOUR, paper())).sent).toEqual([{ at: 2 * MINUTE, kind: "problem", reason: "media-empty" }]);
  });

  it("reminds every 4 hours while open", () => {
    const { sent } = run(steady(0, 9 * HOUR, paper()));
    expect(sent.map((s) => [s.kind, s.at])).toEqual([
      ["problem", 2 * MINUTE],
      ["reminder", 2 * MINUTE + 4 * HOUR],
      ["reminder", 2 * MINUTE + 8 * HOUR],
    ]);
  });

  it("holds reminders while closed, and sends one when the venue opens", () => {
    const { sent } = run([
      ...steady(0, 10 * HOUR, paper(), false),
      ...steady(10 * HOUR + 30_000, 11 * HOUR, paper(), true),
    ]);
    expect(sent.map((s) => [s.kind, s.at])).toEqual([
      ["problem", 2 * MINUTE],
      ["reminder", 10 * HOUR + 30_000],
    ]);
  });

  it("does not remind at opening right after the first email", () => {
    const { sent } = run([
      ...steady(0, 5 * MINUTE, paper(), false),
      ...steady(5 * MINUTE + 30_000, 30 * MINUTE, paper(), true),
    ]);
    expect(sent.map((s) => s.kind)).toEqual(["problem"]);
  });

  it("emails again, straight away, when the problem changes", () => {
    const { sent } = run([...steady(0, 10 * MINUTE, paper()), ...steady(10 * MINUTE + 30_000, 20 * MINUTE, jam)]);
    expect(sent).toEqual([
      { at: 2 * MINUTE, kind: "problem", reason: "media-empty" },
      { at: 10 * MINUTE + 30_000, kind: "problem", reason: "media-jam" },
    ]);
  });

  it("says it is fixed once the problem has stayed gone for the grace period, even when closed", () => {
    const { sent, state } = run([
      ...steady(0, 10 * MINUTE, paper()),
      ...steady(10 * MINUTE + 30_000, 20 * MINUTE, null, false),
    ]);
    expect(sent.map((s) => [s.kind, s.at])).toEqual([
      ["problem", 2 * MINUTE],
      ["resolved", 10 * MINUTE + 30_000 + 2 * MINUTE],
    ]);
    expect(state).toEqual({ phase: "ok" });
  });

  it("does not flap when the problem briefly disappears", () => {
    const { sent } = run([
      ...steady(0, 10 * MINUTE, paper()),
      ...steady(10 * MINUTE + 30_000, 11 * MINUTE, null),
      ...steady(11 * MINUTE + 30_000, 20 * MINUTE, paper()),
    ]);
    expect(sent.map((s) => s.kind)).toEqual(["problem"]);
  });

  it("picks up where it left off from saved state, without re-sending", () => {
    const saved: AlertState = { phase: "alerting", reason: "media-empty", since: 0, lastSentAt: 0, clearingSince: null };
    expect(run(steady(HOUR, 2 * HOUR, paper()), saved).sent).toEqual([]);
  });
});
