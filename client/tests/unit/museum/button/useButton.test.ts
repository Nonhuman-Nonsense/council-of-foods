import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

const transport = vi.hoisted(() => ({
  setLedMode: vi.fn().mockResolvedValue(undefined),
  isSerialDeviceConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@/museum/button/buttonBridge", () => ({
  isButtonBridgeAvailable: () => true,
  ButtonTransport: class MockButtonTransport {
    setLedMode = transport.setLedMode;
    isSerialDeviceConnected = transport.isSerialDeviceConnected;
    connect = vi.fn();
    disconnect = vi.fn();
    enableAutoReconnect = vi.fn();
    isSessionHealthy = vi.fn();
  },
}));

describe("useButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("councilAppMode", "museum");
    _resetButtonStoreForTests();
    useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: true });
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("claim registers owner and release clears on unmount", async () => {
    const { useButton } = await import("@/museum/button/useButton");

    const { result, unmount } = renderHook(() => useButton("human-input"));

    result.current.claim();
    result.current.setArmed(true);
    await Promise.resolve();

    expect(useButtonStore.getState().claims["human-input"]).toBe(true);
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().ledMode).toBe("pulse");

    unmount();
    result.current.release();

    expect(useButtonStore.getState().claims["human-input"]).toBeUndefined();
    expect(useButtonStore.getState().buttonOwner).toBeNull();
  });

  it("routes pressed only to the winning owner", async () => {
    const { useButton } = await import("@/museum/button/useButton");

    const { result: meta } = renderHook(() => useButton("meta-agent"));
    const { result: human } = renderHook(() => useButton("human-input"));

    act(() => {
      meta.current.claim();
      human.current.claim();
      useButtonStore.setState({ pressed: true, armed: true });
    });

    expect(human.current.pressed).toBe(true);
    expect(meta.current.pressed).toBe(false);
    expect(human.current.isOwner).toBe(true);
  });

  it("exposes wantsMic to the owner when a tap has latched the mic open", async () => {
    const { useButton } = await import("@/museum/button/useButton");

    const { result } = renderHook(() => useButton("setup-agent"));
    act(() => {
      result.current.claim();
      useButtonStore.setState({ armed: true, latched: true });
    });

    // Latched, not physically held: the mic is open but `pressed` stays false
    // so edge-triggered consumers see nothing.
    expect(result.current.wantsMic).toBe(true);
    expect(result.current.pressed).toBe(false);
  });

  it("wants no microphone while disarmed, even with a latch set", async () => {
    // A click can set the latch before the agent has armed the button; until it
    // does, the button must not report the mic as open.
    const { useButton } = await import("@/museum/button/useButton");

    const { result } = renderHook(() => useButton("setup-agent"));
    act(() => {
      result.current.claim();
      useButtonStore.setState({ armed: false, latched: true });
    });
    expect(result.current.wantsMic).toBe(false);

    act(() => {
      useButtonStore.setState({ armed: true });
    });
    expect(result.current.wantsMic).toBe(true);
  });

  it("keeps ownership while disarmed", async () => {
    const { useButton } = await import("@/museum/button/useButton");

    const { result } = renderHook(() => useButton("meta-agent"));
    result.current.claim();
    result.current.setArmed(false);
    await Promise.resolve();

    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().ledMode).toBe("off");
  });
});
