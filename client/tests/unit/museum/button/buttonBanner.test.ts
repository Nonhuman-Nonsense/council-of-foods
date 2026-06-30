import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  BUTTON_BANNER_IDLE_MS,
  computeBannerVisible,
  shouldActivateIdleRemind,
  useButtonBanner,
} from "@museum/button/useButtonBanner";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

describe("useButtonBanner store sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    _resetButtonStoreForTests();
    useButtonStore.getState().claimButton("human-input");
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetButtonStoreForTests();
  });

  it("publishes banner visibility to buttonStore for the routed owner", () => {
    renderHook(() =>
      useButtonBanner({
        owner: "human-input",
        sessionActive: true,
        isConnecting: false,
        micOpen: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
    });

    expect(useButtonStore.getState().activeButtonBanner).toBe(true);
  });

  it("clears store visibility on unmount", () => {
    const { unmount } = renderHook(() =>
      useButtonBanner({
        owner: "human-input",
        sessionActive: true,
        isConnecting: false,
        micOpen: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
    });
    expect(useButtonStore.getState().activeButtonBanner).toBe(true);

    unmount();
    expect(useButtonStore.getState().activeButtonBanner).toBe(false);
  });
});

describe("computeBannerVisible", () => {
  const base = {
    sessionActive: true,
    isConnecting: false,
    micOpen: false,
    idleRemindActive: false,
  };

  it("hides before idle remind", () => {
    expect(computeBannerVisible(base)).toBe(false);
  });

  it("shows after idle remind when button is up", () => {
    expect(computeBannerVisible({ ...base, idleRemindActive: true })).toBe(true);
  });

  it("hides while the button is pressed", () => {
    expect(
      computeBannerVisible({ ...base, idleRemindActive: true, micOpen: true }),
    ).toBe(false);
  });

  it("hides while connecting", () => {
    expect(
      computeBannerVisible({ ...base, idleRemindActive: true, isConnecting: true }),
    ).toBe(false);
  });
});

describe("shouldActivateIdleRemind", () => {
  it("does not remind before the idle clock starts", () => {
    expect(shouldActivateIdleRemind(false, 0, BUTTON_BANNER_IDLE_MS)).toBe(false);
  });

  it("reminds after the idle window", () => {
    expect(shouldActivateIdleRemind(true, 0, BUTTON_BANNER_IDLE_MS)).toBe(true);
    expect(shouldActivateIdleRemind(true, 0, BUTTON_BANNER_IDLE_MS - 1)).toBe(false);
  });
});

describe("useButtonBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseParams = {
    owner: "human-input" as const,
    sessionActive: true,
    isConnecting: false,
    micOpen: false,
  };

  it("does not show the banner immediately when the session starts", () => {
    const { result } = renderHook(() => useButtonBanner(baseParams));

    expect(result.current.bannerVisible).toBe(false);
    expect(result.current.idleRemindActive).toBe(false);
  });

  it("shows the banner after the idle window without a PTT press", () => {
    const { result } = renderHook(() => useButtonBanner(baseParams));

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
    });

    expect(result.current.idleRemindActive).toBe(true);
    expect(result.current.bannerVisible).toBe(true);
  });

  it("fires onIdleTerminal 10s after the banner becomes visible", () => {
    const onIdleTerminal = vi.fn();
    renderHook(() =>
      useButtonBanner({
        ...baseParams,
        onIdleTerminal,
        canIdleTerminal: () => true,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
    });

    expect(onIdleTerminal).toHaveBeenCalledTimes(1);
  });

  it("does not fire onIdleTerminal before the banner phase", () => {
    const onIdleTerminal = vi.fn();
    renderHook(() =>
      useButtonBanner({
        ...baseParams,
        onIdleTerminal,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS - 1);
    });

    expect(onIdleTerminal).not.toHaveBeenCalled();
  });

  it("resets idle countdown on bumpBannerActivity", () => {
    const { result } = renderHook(() => useButtonBanner(baseParams));

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS - 1);
    });

    act(() => {
      result.current.bumpBannerActivity();
    });

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS - 1);
    });

    expect(result.current.idleRemindActive).toBe(false);
  });

  it("respects canIdleTerminal", () => {
    const onIdleTerminal = vi.fn();
    renderHook(() =>
      useButtonBanner({
        ...baseParams,
        onIdleTerminal,
        canIdleTerminal: () => false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS * 2);
    });

    expect(onIdleTerminal).not.toHaveBeenCalled();
  });
});
