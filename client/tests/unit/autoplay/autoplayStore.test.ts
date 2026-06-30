import { describe, it, expect, beforeEach } from "vitest";
import {
  useAutoplayStore,
  notifyAutoplay,
  bumpAutoplayActivity,
  _setAutoplayLastActivityMsForTests,
} from "@/autoplay/autoplayStore";

describe("autoplayStore", () => {
  beforeEach(() => {
    useAutoplayStore.getState().resetForTests();
  });

  it("bumps last activity time", () => {
    const before = useAutoplayStore.getState().lastActivityMs;
    _setAutoplayLastActivityMsForTests(before - 10_000);
    bumpAutoplayActivity("button-press");
    expect(useAutoplayStore.getState().lastActivityMs).toBeGreaterThan(before - 10_000);
  });

  it("tracks phase changes", () => {
    useAutoplayStore.getState().setPhase("warning");
    expect(useAutoplayStore.getState().phase).toBe("warning");
    useAutoplayStore.getState().setPhase("active");
    expect(useAutoplayStore.getState().phase).toBe("active");
  });

  it("records council-state without checking phase", () => {
    useAutoplayStore.getState().setPhase("off");
    notifyAutoplay({ type: "council-state", state: "summary" });
    expect(useAutoplayStore.getState().councilOnSummary).toBe(true);
    expect(useAutoplayStore.getState().summaryFinishedTickAtEntry).toBe(0);

    notifyAutoplay({ type: "council-state", state: "playing" });
    expect(useAutoplayStore.getState().councilOnSummary).toBe(false);
  });

  it("resets idle clock when summary-playback-finished fires", () => {
    const stale = Date.now() - 120_000;
    _setAutoplayLastActivityMsForTests(stale);
    notifyAutoplay({ type: "council-state", state: "summary" });
    notifyAutoplay({ type: "summary-playback-finished" });

    const state = useAutoplayStore.getState();
    expect(state.summaryFinishedTick).toBe(1);
    expect(state.lastActivityMs).toBeGreaterThan(stale);
  });

  it("records summary-playback-finished regardless of phase", () => {
    useAutoplayStore.getState().setPhase("off");
    expect(useAutoplayStore.getState().summaryFinishedTick).toBe(0);
    notifyAutoplay({ type: "summary-playback-finished" });
    expect(useAutoplayStore.getState().summaryFinishedTick).toBe(1);
    notifyAutoplay({ type: "summary-playback-finished" });
    expect(useAutoplayStore.getState().summaryFinishedTick).toBe(2);
  });
});
