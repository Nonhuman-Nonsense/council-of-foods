import { create } from "zustand";
import { reportTerminalError, type ClientReportSeverity, type ClientReportImpact } from "@/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionErrorSource = "socket" | "voice-guide" | "meta-agent";
export type SetConnectionError = (source: ConnectionErrorSource, active: boolean) => void;

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
  /** Set of subsystems currently reporting a connection problem. */
  activeSources: ReadonlySet<ConnectionErrorSource>;
  /** True when any source is active. */
  connectionError: boolean;
  setConnectionError: (source: ConnectionErrorSource, active: boolean) => void;
  unrecoverableError: UnrecoverableError | null;
  setUnrecoverableError: SetUnrecoverableError;
  resetForTests: () => void;
};

export const useErrorStore = create<ErrorStore>((set) => ({
  activeSources: new Set(),
  connectionError: false,

  setConnectionError: (source, active) =>
    set((state) => {
      const next = new Set(state.activeSources);
      if (active) {
        next.add(source);
      } else {
        next.delete(source);
      }
      return { activeSources: next, connectionError: next.size > 0 };
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
    set({ activeSources: new Set(), connectionError: false, unrecoverableError: null }),
}));

// ---------------------------------------------------------------------------
// Non-React helpers (mirrors notifyAutoplay / bumpAutoplayActivity pattern)
// ---------------------------------------------------------------------------

/** Set or clear a connection error source from outside React. */
export function setConnectionError(source: ConnectionErrorSource, active: boolean): void {
  useErrorStore.getState().setConnectionError(source, active);
}

/** Report a fatal unrecoverable error from outside React. */
export function setUnrecoverableError(error: UnrecoverableError | string | null): void {
  useErrorStore.getState().setUnrecoverableError(error);
}
