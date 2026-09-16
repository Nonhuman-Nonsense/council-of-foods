/**
 * When the printer's condition is worth an email. Pure: the monitor feeds it the
 * current attention (from the spool), the time and whether the venue is open,
 * and sends whatever it returns.
 *
 *   ok ──problem──► pending ──still there after grace──► alerting → "problem"
 *    ▲                 │                                    ├─ reason changes → "problem"
 *    └──────gone───────┘                                    ├─ open, and 4 h since the last email,
 *                                                           │  or the venue just opened → "reminder"
 *                                                           └─ gone for the grace period → ok, "resolved"
 */

export type Attention = { reason: string; since: number } | null;

export type AlertState =
  | { phase: "ok" }
  | { phase: "pending"; reason: string; since: number; firstSeenAt: number }
  | {
      phase: "alerting";
      reason: string;
      since: number;
      lastSentAt: number;
      /** When the problem was last seen gone; it must stay gone for the grace period. */
      clearingSince: number | null;
    };

export type AlertKind = "problem" | "reminder" | "resolved";

export type Outgoing = { kind: AlertKind; reason: string; since: number };

export type AlertTimings = {
  /** A problem (or its absence) must last this long before it counts. */
  graceMs: number;
  /** While open, remind this often. */
  reminderMs: number;
  /** A reminder at opening time needs at least this long since the last email. */
  openingReminderGapMs: number;
};

export type AlertStepContext = {
  now: number;
  open: boolean;
  /** Whether the venue was open at the previous step: open && !wasOpen means it just opened. */
  wasOpen: boolean;
  timings: AlertTimings;
};

export const INITIAL_ALERT_STATE: AlertState = { phase: "ok" };

export function stepAlerts(
  state: AlertState,
  attention: Attention,
  { now, open, wasOpen, timings }: AlertStepContext,
): { state: AlertState; send: Outgoing | null } {
  switch (state.phase) {
    case "ok":
      return attention
        ? { state: { phase: "pending", reason: attention.reason, since: attention.since, firstSeenAt: now }, send: null }
        : { state, send: null };

    case "pending": {
      if (!attention) return { state: { phase: "ok" }, send: null };
      if (now - state.firstSeenAt < timings.graceMs) {
        return { state: { ...state, reason: attention.reason, since: attention.since }, send: null };
      }
      return {
        state: { phase: "alerting", reason: attention.reason, since: attention.since, lastSentAt: now, clearingSince: null },
        send: { kind: "problem", reason: attention.reason, since: attention.since },
      };
    }

    case "alerting": {
      if (!attention) {
        const clearingSince = state.clearingSince ?? now;
        if (now - clearingSince < timings.graceMs) {
          return { state: { ...state, clearingSince }, send: null };
        }
        return { state: { phase: "ok" }, send: { kind: "resolved", reason: state.reason, since: state.since } };
      }

      if (attention.reason !== state.reason) {
        return {
          state: { phase: "alerting", reason: attention.reason, since: attention.since, lastSentAt: now, clearingSince: null },
          send: { kind: "problem", reason: attention.reason, since: attention.since },
        };
      }

      const sinceLast = now - state.lastSentAt;
      const reminderDue =
        open &&
        (sinceLast >= timings.reminderMs || (!wasOpen && sinceLast >= timings.openingReminderGapMs));
      if (reminderDue) {
        return {
          state: { ...state, lastSentAt: now, clearingSince: null },
          send: { kind: "reminder", reason: state.reason, since: state.since },
        };
      }
      return { state: { ...state, clearingSince: null }, send: null };
    }
  }
}
