/**
 * ErrorBot reporting for the realtime voice agent.
 *
 * The agent is the one part of the app that fails *quietly*: a provider error
 * tears the session down and reconnects behind a spinner, and on an unattended
 * installation nobody is watching the console. These reports make the failure
 * rate visible — how often sessions restart, and why.
 *
 * Volume is the whole problem here. A single wedged kiosk can emit the same
 * error every few seconds for hours, and ErrorBot is for humans to read, so
 * occurrences are sampled on a thinning schedule rather than capped outright:
 * a rare hiccup still shows up, and a persistent one keeps a heartbeat instead
 * of either flooding the channel or falling silent after the first few.
 */

import { reportTerminalError, type ClientReportImpact, type ClientReportSeverity } from "@/logger";

export type RealtimeIssueKind =
  /** A provider error that forced a teardown + reconnect. */
  | "provider-error"
  /** The transport dropped mid-session (ICE failure, data channel error). */
  | "connection-lost"
  /** A turn the event loop rescued after the provider refused it. */
  | "turn-recovered"
  /** Retries ran out — the agent is down for this visitor. */
  | "retry-exhausted";

const SEVERITY: Record<RealtimeIssueKind, ClientReportSeverity> = {
  "provider-error": "warning",
  "connection-lost": "warning",
  "turn-recovered": "warning",
  "retry-exhausted": "error",
};

const IMPACT: Record<RealtimeIssueKind, ClientReportImpact> = {
  // The visitor sees a spinner at worst; the session comes back on its own.
  "provider-error": "none",
  "connection-lost": "none",
  "turn-recovered": "none",
  // Nothing is coming back without a reload — the agent is gone for good.
  "retry-exhausted": "terminal",
};

/** Occurrence numbers worth reporting: dense at first, then a thinning heartbeat. */
const SAMPLED_OCCURRENCES = new Set([1, 2, 3, 5, 10, 25, 50, 100]);
const HEARTBEAT_EVERY = 100;

/**
 * Should the nth occurrence of one issue be reported?
 *
 * Exported for the tests, and because the schedule is the interesting part:
 * counts read as "at least this many", never as an exact frequency.
 */
export function shouldReportOccurrence(count: number): boolean {
  if (count < 1) return false;
  return SAMPLED_OCCURRENCES.has(count) || count % HEARTBEAT_EVERY === 0;
}

const occurrences = new Map<string, number>();

/** Test seam: clears the per-page-load occurrence counters. */
export function resetRealtimeIssueCounts(): void {
  occurrences.clear();
}

export function reportRealtimeIssue(params: {
  /** Which agent this is — `setup-agent`, `council`, … */
  feature: string;
  kind: RealtimeIssueKind;
  message: string;
  /** Provider error code, when the event carried one. Keys the dedupe. */
  code?: string | null;
  /** Extra context for the ErrorBot payload (attempt number, reason, …). */
  detail?: Record<string, unknown>;
}): void {
  const { feature, kind, message, code, detail } = params;
  const key = `${feature}|${kind}|${code ?? ""}`;
  const count = (occurrences.get(key) ?? 0) + 1;
  occurrences.set(key, count);
  if (!shouldReportOccurrence(count)) return;

  reportTerminalError(
    `realtime.${feature}.${kind}`,
    `${message} (occurrence ${count})`,
    { code: code ?? null, ...detail },
    { severity: SEVERITY[kind], clientImpact: IMPACT[kind] },
  );
}
