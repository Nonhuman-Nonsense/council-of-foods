import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useAutoplayStore,
  notifyAutoplay,
  bumpAutoplayActivity,
  _setAutoplayLastActivityMsForTests,
} from "@/autoplay/autoplayStore";

const mockFetchAutoplayMeetingId = vi.hoisted(() => vi.fn().mockResolvedValue(42));
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("@api/fetchAutoplayMeeting", () => ({
  fetchAutoplayMeetingId: mockFetchAutoplayMeetingId,
}));

vi.mock("@/logger", () => ({
  log: { event: vi.fn() },
  reportTerminalError: vi.fn(),
}));

describe("autoplayStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("clears council-derived flags on council-unmounted without touching phase", () => {
    useAutoplayStore.getState().setPhase("active");
    notifyAutoplay({ type: "council-state", state: "summary" });
    notifyAutoplay({ type: "summary-playback-finished" });

    notifyAutoplay({ type: "council-unmounted" });

    expect(useAutoplayStore.getState().phase).toBe("active");
    expect(useAutoplayStore.getState().councilOnSummary).toBe(false);
    expect(useAutoplayStore.getState().summaryProtocolFinished).toBe(false);
  });

  it("starts meetingGeneration at zero after resetForTests", () => {
    expect(useAutoplayStore.getState().meetingGeneration).toBe(0);
  });

  it("navigateToAutoplayMeeting increments meetingGeneration and navigates", async () => {
    const id = await useAutoplayStore
      .getState()
      .navigateToAutoplayMeeting(mockNavigate, "en");

    expect(id).toBe(42);
    expect(mockFetchAutoplayMeetingId).toHaveBeenCalledWith("en");
    expect(useAutoplayStore.getState().meetingGeneration).toBe(1);
    expect(mockNavigate).toHaveBeenCalledWith("/meeting/42", { replace: true });
  });
});
