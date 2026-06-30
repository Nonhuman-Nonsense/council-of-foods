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

  it("resets summaryProtocolFinished when entering summary", () => {
    notifyAutoplay({ type: "summary-playback-finished" });
    expect(useAutoplayStore.getState().summaryProtocolFinished).toBe(true);

    notifyAutoplay({ type: "council-state", state: "summary" });
    expect(useAutoplayStore.getState().councilOnSummary).toBe(true);
    expect(useAutoplayStore.getState().summaryProtocolFinished).toBe(false);

    notifyAutoplay({ type: "council-state", state: "playing" });
    expect(useAutoplayStore.getState().councilOnSummary).toBe(false);
  });

  it("marks summary protocol finished on summary-playback-finished", () => {
    notifyAutoplay({ type: "council-state", state: "summary" });
    notifyAutoplay({ type: "summary-playback-finished" });
    expect(useAutoplayStore.getState().summaryProtocolFinished).toBe(true);
  });
});
