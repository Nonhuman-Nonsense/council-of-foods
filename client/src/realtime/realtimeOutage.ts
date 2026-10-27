/**
 * One ErrorBot report per realtime outage, not one per failed attempt.
 *
 * An outage runs from the first failure that sends the agent into a retry
 * until it is live again, or until retries run out. A person reading ErrorBot
 * wants to know how often visitors lost the agent and for how long — not every
 * attempt it took to get it back. So:
 *
 * - A start that fails once and works on the next try cost the visitor a
 *   second of spinner. It stays in the browser log and is never reported —
 *   the typical case is the first request after a laptop wakes from sleep.
 * - A live session that dropped, or a start that needed several tries, is
 *   reported once, when the agent is back.
 * - An outage still going (installations retry forever) reports a thinning
 *   heartbeat, so a wedged kiosk can't stay silent.
 * - Running out of retries (the web) is one `retry-exhausted` report.
 */

import { reportRealtimeIssue } from "@realtime/realtimeErrorReporting";

export type RealtimeOutageReporter = {
  /**
   * One failed attempt. `cause` is a short code (`start-failed`, `pc_failed`, …)
   * and keys the report; `wasLive` says a working session was just lost;
   * `retriesUnlimited` says no give-up report will ever summarise this outage.
   */
  failed(failure: { cause: string; message?: string; wasLive: boolean; retriesUnlimited: boolean }): void;
  /** The agent is live again. */
  recovered(): void;
  /** Retries ran out: the agent is off for this visitor. */
  gaveUp(detail: { giveUpSilently: boolean }): void;
  /** The session was stopped on purpose: forget the outage without reporting it. */
  reset(): void;
};

/** Failure counts within one outage that report it as still down. */
const STILL_DOWN_AT = new Set([3, 10, 25, 50, 100]);
const STILL_DOWN_EVERY = 100;

type Outage = {
  startedAt: number;
  failures: number;
  firstCause: string;
  lastCause: string;
  firstMessage?: string;
  lastMessage?: string;
  /** The outage began by losing a live session, not by failing to start one. */
  wasLive: boolean;
};

export function createRealtimeOutageReporter(
  feature: string,
  now: () => number = Date.now,
): RealtimeOutageReporter {
  let outage: Outage | null = null;

  function summary(o: Outage) {
    return {
      failures: o.failures,
      durationMs: now() - o.startedAt,
      firstCause: o.firstCause,
      lastCause: o.lastCause,
      firstMessage: o.firstMessage,
      lastMessage: o.lastMessage,
      wasLive: o.wasLive,
    };
  }

  function seconds(o: Outage): string {
    return ((now() - o.startedAt) / 1000).toFixed(1);
  }

  return {
    failed({ cause, message, wasLive, retriesUnlimited }) {
      if (!outage) {
        outage = { startedAt: now(), failures: 0, firstCause: cause, lastCause: cause, firstMessage: message, wasLive };
      }
      outage.failures += 1;
      outage.lastCause = cause;
      outage.lastMessage = message;

      // A bounded budget ends in one give-up report, so only an outage that
      // can last forever needs a heartbeat of its own.
      const n = outage.failures;
      if (!retriesUnlimited || !(STILL_DOWN_AT.has(n) || n % STILL_DOWN_EVERY === 0)) return;
      reportRealtimeIssue({
        feature,
        kind: "still-down",
        message: `Realtime agent still down after ${n} failed attempts in ${seconds(outage)}s (first: ${outage.firstCause}, last: ${cause})`,
        code: outage.firstCause,
        detail: summary(outage),
        presampled: true,
      });
    },

    recovered() {
      const o = outage;
      outage = null;
      if (!o) return;
      if (!o.wasLive && o.failures < 2) return;
      reportRealtimeIssue({
        feature,
        kind: "recovered",
        message: o.wasLive
          ? `Realtime session interrupted (${o.firstCause}), back after ${o.failures} failed attempt${o.failures === 1 ? "" : "s"} in ${seconds(o)}s`
          : `Realtime session took ${o.failures + 1} attempts to start (first: ${o.firstCause}), live after ${seconds(o)}s`,
        code: o.firstCause,
        detail: summary(o),
      });
    },

    gaveUp({ giveUpSilently }) {
      const o = outage;
      outage = null;
      reportRealtimeIssue({
        feature,
        kind: "retry-exhausted",
        message: `Realtime agent gave up after ${o?.failures ?? 0} failed attempts${o ? ` in ${seconds(o)}s (first: ${o.firstCause})` : ""}${giveUpSilently ? ", switched off" : ""}`,
        code: o?.firstCause,
        detail: { giveUpSilently, ...(o ? summary(o) : {}) },
      });
    },

    reset() {
      outage = null;
    },
  };
}
