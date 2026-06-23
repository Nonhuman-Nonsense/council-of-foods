import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

const transport = vi.hoisted(() => ({
  setLedMode: vi.fn().mockResolvedValue(undefined),
  isSerialDeviceConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@/museum/button/transport", () => ({
  ButtonTransport: class MockButtonTransport {
    setLedMode = transport.setLedMode;
    isSerialDeviceConnected = transport.isSerialDeviceConnected;
    connect = vi.fn();
    disconnect = vi.fn();
    enableAutoReconnect = vi.fn();
    isSessionHealthy = vi.fn();
  },
}));

describe("useButtonLed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetButtonStoreForTests();
    useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: true });
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("registers intent on mount and clears on unmount", async () => {
    const { useButtonLed } = await import("@/museum/button/hooks");

    const { unmount } = renderHook(() => useButtonLed("human-input", "pulse"));

    expect(useButtonStore.getState().buttonIntents["human-input"]).toBe("pulse");
    expect(useButtonStore.getState().ledMode).toBe("pulse");

    unmount();

    expect(useButtonStore.getState().buttonIntents["human-input"]).toBeUndefined();
    expect(useButtonStore.getState().ledMode).toBe("off");
  });

  it("does not register when inactive", async () => {
    const { useButtonLed } = await import("@/museum/button/hooks");

    renderHook(() => useButtonLed("setup", "pulse", false));

    expect(useButtonStore.getState().buttonIntents).toEqual({});
  });
});
