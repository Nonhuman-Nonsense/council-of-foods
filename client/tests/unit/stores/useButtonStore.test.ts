import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetButtonStoreForTests, useButtonStore } from "@stores/useButtonStore";

const transport = vi.hoisted(() => ({
  callbacks: null as {
    onStatus?: (status: string, error?: string | null) => void;
    onSerialDeviceChange?: (connected: boolean) => void;
    onLine?: (event: { type: string }) => void;
  } | null,
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
  setLedMode: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue("disconnected"),
  isSessionHealthy: vi.fn().mockReturnValue(false),
  isSerialDeviceConnected: vi.fn().mockReturnValue(true),
}));

vi.mock("@/button/transport", () => ({
  ButtonTransport: class MockButtonTransport {
    constructor(callbacks: {
      onStatus?: (status: string, error?: string | null) => void;
      onSerialDeviceChange?: (connected: boolean) => void;
      onLine?: (event: { type: string }) => void;
    }) {
      transport.callbacks = callbacks;
    }

    connect = transport.connect;
    disconnect = transport.disconnect;
    enableAutoReconnect = transport.enableAutoReconnect;
    setLedMode = transport.setLedMode;
    getStatus = transport.getStatus;
    isSessionHealthy = transport.isSessionHealthy;
    isSerialDeviceConnected = transport.isSerialDeviceConnected;
  },
}));

describe("useButtonStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    _resetButtonStoreForTests();
    useButtonStore.getState().init();
    await useButtonStore.getState().connect();
  });

  afterEach(() => {
    _resetButtonStoreForTests();
  });

  it("gates pressed state on buttonInputEnabled", () => {
    useButtonStore.setState({ buttonInputEnabled: false });
    useButtonStore.getState().setPressed(true, "button");
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("tracks rawPressed from button lines even when input is disabled", () => {
    useButtonStore.setState({ buttonInputEnabled: false, bridgeStatus: "connected" });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().rawPressed).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("sets pressed when input is enabled and button goes down", () => {
    useButtonStore.setState({ buttonInputEnabled: true, bridgeStatus: "connected" });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().pressed).toBe(true);
    transport.callbacks?.onLine?.({ type: "button_up" });
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("enables input and syncs LED when registerLedIntent is pulse", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().registerLedIntent("human-input", "pulse");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonInputEnabled).toBe(true);
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("human-input wins over setup when both register intents", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().registerLedIntent("setup", "pulse");
    useButtonStore.getState().registerLedIntent("human-input", "on");
    await Promise.resolve();
    expect(useButtonStore.getState().ledMode).toBe("on");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("on");
  });

  it("falls back to setup intent when human-input unregisters", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().registerLedIntent("setup", "pulse");
    useButtonStore.getState().registerLedIntent("human-input", "on");
    useButtonStore.getState().registerLedIntent("human-input", null);
    await Promise.resolve();
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("pulse");
  });

  it("clears pressed state when bridge disconnects", () => {
    useButtonStore.setState({
      pressed: true,
      rawPressed: true,
      buttonInputEnabled: true,
      bridgeStatus: "connected",
    });
    transport.callbacks?.onStatus?.("disconnected");
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().rawPressed).toBe(false);
    expect(useButtonStore.getState().buttonInputEnabled).toBe(false);
  });

  it("connects through transport", async () => {
    await useButtonStore.getState().connect();
    expect(transport.connect).toHaveBeenCalled();
  });

  it("does not send LED commands when usb serial is disconnected", async () => {
    transport.isSerialDeviceConnected.mockReturnValue(false);
    useButtonStore.setState({ bridgeStatus: "connected", serialDeviceConnected: false });
    useButtonStore.getState().registerLedIntent("human-input", "pulse");
    await Promise.resolve();
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).not.toHaveBeenCalled();
  });

  it("resyncs LED when usb serial connects", async () => {
    useButtonStore.setState({
      bridgeStatus: "connected",
      ledMode: "pulse",
      serialDeviceConnected: false,
    });
    transport.isSerialDeviceConnected.mockReturnValue(true);
    transport.setLedMode.mockClear();

    transport.callbacks?.onSerialDeviceChange?.(true);

    await Promise.resolve();
    expect(useButtonStore.getState().serialDeviceConnected).toBe(true);
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("clears pressed state when usb serial disconnects", () => {
    useButtonStore.setState({
      pressed: true,
      rawPressed: true,
      bridgeStatus: "connected",
      serialDeviceConnected: true,
    });
    transport.callbacks?.onSerialDeviceChange?.(false);
    expect(useButtonStore.getState().pressed).toBe(false);
    expect(useButtonStore.getState().rawPressed).toBe(false);
    expect(useButtonStore.getState().serialDeviceConnected).toBe(false);
  });

  it("applies button_up sync after reconnect when input was stale", () => {
    useButtonStore.setState({
      pressed: true,
      rawPressed: true,
      buttonInputEnabled: true,
      bridgeStatus: "connected",
      serialDeviceConnected: true,
    });
    transport.callbacks?.onSerialDeviceChange?.(false);
    transport.callbacks?.onLine?.({ type: "button_up" });
    expect(useButtonStore.getState().rawPressed).toBe(false);
    expect(useButtonStore.getState().pressed).toBe(false);
  });

  it("tracks button_down sync after reconnect when button is held", () => {
    useButtonStore.setState({
      bridgeStatus: "connected",
      serialDeviceConnected: true,
      buttonInputEnabled: true,
      ledMode: "pulse",
    });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().rawPressed).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);
  });
});
