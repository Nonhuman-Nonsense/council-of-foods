import type { PrinterStatus } from "./printer.js";

/**
 * Whether the printer needs someone to come and look at it, and why. Pure, so
 * every case is a table row; the spool feeds it and remembers since when.
 */

export type AttentionReason = {
  /** A normalised CUPS reason (`media-empty`), or `stopped` / `not-printing` / `no-printer`. */
  reason: string;
  /** When the problem is known to have started, if the evidence says (the oldest waiting job). */
  since: number | null;
};

export type AttentionInput = {
  printer: PrinterStatus | null;
  /** Oldest protocol not yet printed: waiting in the spool or in the printer's queue. */
  oldestWaitingAt: number | null;
  now: number;
  notPrintingAfterMs: number;
};

/**
 * CUPS reasons carry a severity suffix. `-warning` (toner low) is not worth a
 * trip; `cups-*` are CUPS's own bookkeeping, not the printer's condition.
 */
export function normalizeReason(raw: string): string | null {
  if (raw.endsWith("-warning") || raw.startsWith("cups-") || raw === "none" || raw === "paused") {
    return null;
  }
  return raw.replace(/-(error|report)$/, "");
}

export function detectAttention({
  printer,
  oldestWaitingAt,
  now,
  notPrintingAfterMs,
}: AttentionInput): AttentionReason | null {
  if (!printer) return null; // Not asked CUPS yet.
  if (!printer.name) return { reason: "no-printer", since: null };

  const waitingTooLong = oldestWaitingAt !== null && now - oldestWaitingAt >= notPrintingAfterMs;
  const somethingWaiting = oldestWaitingAt !== null;

  for (const raw of printer.alerts) {
    const reason = normalizeReason(raw);
    if (!reason) continue;
    // A printer switched off for the night is only a problem once something needs printing.
    if (reason === "offline" && !somethingWaiting) continue;
    return { reason, since: null };
  }

  if (printer.state === "stopped") return { reason: "stopped", since: null };
  if (waitingTooLong) return { reason: "not-printing", since: oldestWaitingAt };
  return null;
}
