import { create } from "zustand";
import { reportTerminalError, type ClientReportSeverity, type ClientReportImpact } from "@/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionErrorSource = "socket" | "setup-agent" | "meta-agent";
/**
 * Why a source is down. `busy` means the provider is at capacity — nothing is
 * lost and nothing is broken, so the overlay says so instead of claiming a
 * connection failure the visitor could go and check.
 */
export type ConnectionErrorReason = "lost" | "busy";
export type SetConnectionError = (
  source: ConnectionErrorSource,
  active: boolean,
  reason?: ConnectionErrorReason,
) => void;

export type UnrecoverableError = {
  message: string;
  source: string;
  cause?: unknown;
  meetingId?: number;
  /** Overrides the default 'critical' errorbot severity — e.g. 'info' for a stale/bad meeting link. */
  severity?: ClientReportSeverity;
  /** Overrides the default 'terminal' errorbot client impact. */
  clientImpact?: ClientReportImpact;
};

/** Pass a string for message-only errors (source defaults to `client`). */
export type SetUnrecoverableError = (error: UnrecoverableError | string | null) => void;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type ErrorStore = {
  /** Subsystems currently reporting a connection problem, and why. */
  activeSources: ReadonlyMap<ConnectionErrorSource, ConnectionErrorReason>;
  /** True when any source is active. */
  connectionError: boolean;
  /** True when every active source is merely waiting on a busy provider. */
  connectionBusy: boolean;
  /**
   * When the current busy spell began. The overlay only appears once the
   * visitor asks for the agent, which can be long after it went quiet — so the
   * copy is timed from the wait itself, not from when it was first shown.
   */
  busySince: number | null;
  setConnectionError: SetConnectionError;
  unrecoverableError: UnrecoverableError | null;
  setUnrecoverableError: SetUnrecoverableError;
  resetForTests: () => void;
};

export const useErrorStore = create<ErrorStore>((set) => ({
  activeSources: new Map(),
  connectionError: false,
  connectionBusy: false,
  busySince: null,

  setConnectionError: (source, active, reason = "lost") =>
    set((state) => {
      const next = new Map(state.activeSources);
      if (active) {
        next.set(source, reason);
      } else {
        next.delete(source);
      }
      // A genuine drop alongside a busy provider is the more urgent truth, so
      // "busy" only wins when it is the only thing wrong.
      const anyBusy = [...next.values()].some((r) => r === "busy");
      const busy = next.size > 0 && [...next.values()].every((r) => r === "busy");
      return {
        activeSources: next,
        connectionError: next.size > 0,
        connectionBusy: busy,
        // Kept across a spell that is briefly outranked by a real drop, so the
        // clock doesn't restart when that drop clears.
        busySince: anyBusy ? state.busySince ?? Date.now() : null,
      };
    }),

  unrecoverableError: null,

  setUnrecoverableError: (next) => {
    if (next === null) {
      set({ unrecoverableError: null });
      return;
    }
    const normalized: UnrecoverableError =
      typeof next === "string" ? { message: next, source: "client" } : next;
    set({ unrecoverableError: normalized });
    reportTerminalError(normalized.source, normalized.message, normalized.cause, {
      meetingId: normalized.meetingId,
      severity: normalized.severity,
      clientImpact: normalized.clientImpact,
    });
  },

  resetForTests: () =>
    set({
      activeSources: new Map(),
      connectionError: false,
      connectionBusy: false,
      busySince: null,
      unrecoverableError: null,
    }),
}));

// ---------------------------------------------------------------------------
// Non-React helpers (mirrors notifyAutoplay / bumpAutoplayActivity pattern)
// ---------------------------------------------------------------------------

/** Set or clear a connection error source from outside React. */
export function setConnectionError(
  source: ConnectionErrorSource,
  active: boolean,
  reason?: ConnectionErrorReason,
): void {
  useErrorStore.getState().setConnectionError(source, active, reason);
}

/** Report a fatal unrecoverable error from outside React. */
export function setUnrecoverableError(error: UnrecoverableError | string | null): void {
  useErrorStore.getState().setUnrecoverableError(error);
}
