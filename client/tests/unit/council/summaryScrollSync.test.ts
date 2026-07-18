import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import {
  computeTeleprompterBottomPadding,
  computeTeleprompterTopPadding,
  computeTeleprompterEndScrollTop,
  computeTeleprompterScrollTop,
  easeInOutCubic,
  useAudioSyncedScroll,
  type SummaryPlaybackState,
} from "@council/summaryScrollSync";

describe("computeTeleprompterTopPadding", () => {
  it("returns fixed top inset per breakpoint", () => {
    expect(computeTeleprompterTopPadding(false)).toBe(80);
    expect(computeTeleprompterTopPadding(true)).toBe(10);
  });
});

describe("computeTeleprompterBottomPadding", () => {
  it("returns 0 for a non-positive viewport height", () => {
    expect(computeTeleprompterBottomPadding(0)).toBe(0);
    expect(computeTeleprompterBottomPadding(-10)).toBe(0);
  });

  it("returns a bottom runway based on viewport height", () => {
    expect(computeTeleprompterBottomPadding(400)).toBe(140);
  });
});

describe("easeInOutCubic", () => {
  it("returns 0 and 1 at the ends", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("matches linear progress at the midpoint", () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });
});

describe("computeTeleprompterEndScrollTop", () => {
  it("stops before the bottom runway with a 56px inset", () => {
    expect(
      computeTeleprompterEndScrollTop({
        scrollHeight: 500,
        clientHeight: 100,
        bottomPadding: 140,
      }),
    ).toBe(316);
  });
});

describe("computeTeleprompterScrollTop", () => {
  it("returns 0 when content does not overflow", () => {
    expect(
      computeTeleprompterScrollTop({
        scrollHeight: 100,
        clientHeight: 100,
        elapsedSeconds: 5,
        duration: 10,
      }),
    ).toBe(0);
  });

  it("returns 0 when duration is zero", () => {
    expect(
      computeTeleprompterScrollTop({
        scrollHeight: 500,
        clientHeight: 100,
        elapsedSeconds: 5,
        duration: 0,
      }),
    ).toBe(0);
  });

  it("maps elapsed time with ease-in-out to the capped end scroll", () => {
    expect(
      computeTeleprompterScrollTop({
        scrollHeight: 500,
        clientHeight: 100,
        elapsedSeconds: 5,
        duration: 10,
        bottomPadding: 140,
      }),
    ).toBe(158);
  });

  it("clamps progress to the end scroll position", () => {
    expect(
      computeTeleprompterScrollTop({
        scrollHeight: 500,
        clientHeight: 100,
        elapsedSeconds: 20,
        duration: 10,
        bottomPadding: 140,
      }),
    ).toBe(316);
  });
});

describe("useAudioSyncedScroll", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(
        () =>
          ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      ),
    );
    let animationFrames = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames += 1;
      if (animationFrames === 1) {
        callback(0);
      }
      return animationFrames;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not scroll before playback starts", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    element.scrollTop = 0;

    const scrollRef = { current: element };
    const audioContext = { current: { currentTime: 12 } as AudioContext };

    renderHook(() =>
      useAudioSyncedScroll({
        scrollRef,
        enabled: true,
        playback: null,
        audioContext,
      }),
    );

    expect(element.scrollTop).toBe(0);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("scrolls while playback is active", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    element.scrollTop = 0;

    const scrollRef = { current: element };
    const audioContext = { current: { currentTime: 7 } as AudioContext };
    const playback: SummaryPlaybackState = {
      playbackStartInfo: {
        messageId: "summary-1",
        startedAtAudioContextTime: 2,
      },
      duration: 10,
      isPaused: false,
    };

    renderHook(() =>
      useAudioSyncedScroll({
        scrollRef,
        enabled: true,
        playback,
        audioContext,
      }),
    );

    expect(element.scrollTop).toBe(200);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it("holds scroll position while paused", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    element.scrollTop = 150;

    const scrollRef = { current: element };
    const audioContext = { current: { currentTime: 20 } as AudioContext };
    const playback: SummaryPlaybackState = {
      playbackStartInfo: {
        messageId: "summary-1",
        startedAtAudioContextTime: 2,
      },
      duration: 10,
      isPaused: true,
    };

    renderHook(() =>
      useAudioSyncedScroll({
        scrollRef,
        enabled: true,
        playback,
        audioContext,
      }),
    );

    expect(element.scrollTop).toBe(150);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("wires a live scroll ref from render", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { value: 300, configurable: true });
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });

    const { result } = renderHook(() => {
      const scrollRef = useRef<HTMLDivElement | null>(null);
      scrollRef.current = element;
      useAudioSyncedScroll({
        scrollRef,
        enabled: true,
        playback: {
          playbackStartInfo: {
            messageId: "summary-1",
            startedAtAudioContextTime: 0,
          },
          duration: 10,
          isPaused: false,
        },
        audioContext: { current: { currentTime: 5 } as AudioContext },
      });
      return scrollRef;
    });

    expect(result.current.current?.scrollTop).toBe(100);
  });
});
