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

    notifyAutoplay({ type: "council-state", state: "playing" });
    expect(useAutoplayStore.getState().councilOnSummary).toBe(false);
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
