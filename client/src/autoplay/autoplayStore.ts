import { useMemo } from "react";
import { create } from "zustand";
import { log } from "@/logger";

export type AutoplayPhase = "off" | "warning" | "active";

/** Council states consumers may report — mirrors useCouncilMachine CouncilState. */
export type AutoplayCouncilState =
  | "loading"
  | "playing"
  | "waiting"
  | "human_input"
  | "human_panelist"
  | "summary"
  | "meeting_incomplete"
  | "query_extension";

/** Fixed list of events app code may send to autoplay. */
export type AutoplayConsumerEvent =
  | { type: "council-state"; state: AutoplayCouncilState }
  | { type: "summary-playback-finished" };

export type AutoplayActivitySource =
  | "button-press"
  | "pathname"
  | "warning-confirm"
  | "warning-shown"
  | "warning-dismissed"
  | "enter-autoplay"
  | "meeting-end"
  | "loop-next-meeting"
  | "loop-retry";

export type ReplayBannerVariant = "default" | "autoplay";

export type AutoplayHandle = {
  notify: (event: AutoplayConsumerEvent) => void;
  replayBannerVariant: ReplayBannerVariant;
};

type AutoplayStore = {
  phase: AutoplayPhase;
  setPhase: (phase: AutoplayPhase) => void;
  lastActivityMs: number;
  bumpActivity: (source: AutoplayActivitySource) => void;
  councilOnSummary: boolean;
  summaryFinishedTick: number;
  notify: (event: AutoplayConsumerEvent) => void;
  resetForTests: () => void;
};

export const useAutoplayStore = create<AutoplayStore>((set) => ({
  phase: "off",
  setPhase: (phase) => {
    set({ phase });
    log.event("AUTOPLAY", "phase change", { phase });
  },

  lastActivityMs: Date.now(),
  bumpActivity: (source) => {
    set({ lastActivityMs: Date.now() });
    log.event("AUTOPLAY", "activity bump", { source });
  },

  councilOnSummary: false,
  summaryFinishedTick: 0,

  notify: (event) => {
    switch (event.type) {
      case "council-state":
        set({ councilOnSummary: event.state === "summary" });
        log.event("AUTOPLAY", "council-state", { state: event.state });
        break;
      case "summary-playback-finished":
        set((state) => ({ summaryFinishedTick: state.summaryFinishedTick + 1 }));
        log.event("AUTOPLAY", "summary-playback-finished");
        break;
    }
  },

  resetForTests: () => {
    set({
      phase: "off",
      lastActivityMs: Date.now(),
      councilOnSummary: false,
      summaryFinishedTick: 0,
    });
  },
}));

/** Non-React call sites (e.g. useCouncilMachine callbacks). */
export function notifyAutoplay(event: AutoplayConsumerEvent): void {
  useAutoplayStore.getState().notify(event);
}

export function useAutoplay(): AutoplayHandle {
  const replayBannerVariant = useAutoplayStore((state) =>
    state.phase === "active" ? "autoplay" : "default",
  );

  return useMemo(
    () => ({
      notify: (event: AutoplayConsumerEvent) => {
        useAutoplayStore.getState().notify(event);
      },
      replayBannerVariant,
    }),
    [replayBannerVariant],
  );
}

/** Test helper — pin the idle clock. */
export function _setAutoplayLastActivityMsForTests(ms: number): void {
  useAutoplayStore.setState({ lastActivityMs: ms });
}

/** Coordinator-only activity bumps. */
export function bumpAutoplayActivity(source: AutoplayActivitySource): void {
  useAutoplayStore.getState().bumpActivity(source);
}
