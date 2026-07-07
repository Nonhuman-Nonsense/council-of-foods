import { create } from "zustand";

// ---------------------------------------------------------------------------
// Intent types — discriminated union.
//
// Adding a new intent forces an exhaustive switch in the reconciler
// (useCouncilMachine.ts), so the compiler enforces that every new intent
// gets proper timing logic before it can compile.
// ---------------------------------------------------------------------------

export type RaiseHandIntent = {
    kind: "raise-hand";
    meetingId: number;
    /** Conversation index passed to the server — captured at raise time. */
    index: number;
    humanName: string;
};

export type HumanDraftIntent = {
    kind: "human-draft";
    meetingId: number;
    text: string;
    mode: "question" | "panelist";
    /** Position of the awaiting_* sentinel this draft answers, captured at submit time. */
    index: number;
    /** Character id being answered on behalf of — panelist mode only. */
    speaker?: string;
};

export type ResolveExtensionIntent = {
    kind: "resolve-extension";
    meetingId: number;
    choice: "extend" | "conclude";
    /** Position of the query_extension sentinel this resolves, captured at decision time. */
    index: number;
    /** conclude only: local browser date captured at decision time. */
    date?: string;
};

export type PendingIntent = RaiseHandIntent | HumanDraftIntent | ResolveExtensionIntent;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type PendingIntentStore = {
    intent: PendingIntent | null;
    setPendingIntent: (intent: PendingIntent) => void;
    /** Clears the intent only if it matches the given kind — safe to call even if stale. */
    clearPendingIntent: (kind: PendingIntent["kind"]) => void;
    clearAll: () => void;
};

export const usePendingIntentStore = create<PendingIntentStore>((set, get) => ({
    intent: null,

    setPendingIntent: (intent) => set({ intent }),

    clearPendingIntent: (kind) => {
        if (get().intent?.kind === kind) {
            set({ intent: null });
        }
    },

    clearAll: () => set({ intent: null }),
}));

// ---------------------------------------------------------------------------
// Non-React helpers
// ---------------------------------------------------------------------------

export function setPendingIntent(intent: PendingIntent): void {
    usePendingIntentStore.getState().setPendingIntent(intent);
}

export function clearPendingIntent(kind: PendingIntent["kind"]): void {
    usePendingIntentStore.getState().clearPendingIntent(kind);
}

export function clearAllPendingIntents(): void {
    usePendingIntentStore.getState().clearAll();
}
