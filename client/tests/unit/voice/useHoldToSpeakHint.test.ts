import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  BUTTON_IDLE_REMIND_MS,
  shouldShowIdleRemind,
  useHoldToSpeakHint,
} from "@voice/useHoldToSpeakHint";

describe("shouldShowIdleRemind", () => {
  it("returns false before first PTT dismiss", () => {
    expect(shouldShowIdleRemind(false, 0, BUTTON_IDLE_REMIND_MS)).toBe(false);
  });

  it("returns true after idle window", () => {
    expect(shouldShowIdleRemind(true, 0, BUTTON_IDLE_REMIND_MS + 1)).toBe(true);
  });
});

describe("useHoldToSpeakHint bumpActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseParams = {
    agentMode: "ptt",
    sessionActive: true,
    isConnecting: false,
    micOpen: false,
    lastUserTranscript: null as string | null,
    lastCaption: null as string | null,
  };

  it("does not show idle remind immediately after bumpActivity", () => {
    const { result } = renderHook(() => useHoldToSpeakHint(baseParams));

    act(() => {
      result.current.bumpActivity();
    });

    act(() => {
      vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS - 1);
    });

    expect(result.current.idleRemindVisible).toBe(false);
    expect(result.current.showHoldToSpeakHint).toBe(false);
  });

  it("shows idle remind after the window following bumpActivity", () => {
    const { result } = renderHook(() => useHoldToSpeakHint(baseParams));

    act(() => {
      result.current.bumpActivity();
    });

    act(() => {
      vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS);
    });

    expect(result.current.idleRemindVisible).toBe(true);
  });

  it("resets idle countdown on a second bumpActivity", () => {
    const { result } = renderHook(() => useHoldToSpeakHint(baseParams));

    act(() => {
      result.current.bumpActivity();
    });

    act(() => {
      vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS - 1);
    });

    act(() => {
      result.current.bumpActivity();
    });

    act(() => {
      vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS - 1);
    });

    expect(result.current.idleRemindVisible).toBe(false);
  });
});
