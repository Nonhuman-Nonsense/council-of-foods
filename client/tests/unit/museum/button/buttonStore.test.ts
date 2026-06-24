import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";

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

vi.mock("@/museum/button/buttonBridge", () => ({
  isButtonBridgeAvailable: () => true,
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

  it("enables routing and syncs LED when claim + setButtonLed pulse", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonLed("human-input", "pulse");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonInputEnabled).toBe(true);
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("routes press to the winning owner", () => {
    useButtonStore.setState({ bridgeStatus: "connected", buttonInputEnabled: true });
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().claimButton("human-input");
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().pressed).toBe(true);
    useButtonStore.getState().releaseButton("human-input");
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
  });

  it("enables routing when owner claims with off LED", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("meta-agent");
    useButtonStore.getState().setButtonLed("meta-agent", "off");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("meta-agent");
    expect(useButtonStore.getState().buttonInputEnabled).toBe(true);
    expect(useButtonStore.getState().ledMode).toBe("off");
  });

  it("setup wins over human-input when both claim", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonLed("human-input", "on");
    useButtonStore.getState().claimButton("setup");
    useButtonStore.getState().setButtonLed("setup", "pulse");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("setup");
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("pulse");
  });

  it("falls back to human-input LED when setup releases", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonLed("human-input", "on");
    useButtonStore.getState().claimButton("setup");
    useButtonStore.getState().setButtonLed("setup", "pulse");
    useButtonStore.getState().releaseButton("setup");
    await Promise.resolve();
    expect(useButtonStore.getState().buttonOwner).toBe("human-input");
    expect(useButtonStore.getState().ledMode).toBe("on");
    expect(transport.setLedMode).toHaveBeenLastCalledWith("on");
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
    useButtonStore.getState().claimButton("human-input");
    useButtonStore.getState().setButtonLed("human-input", "pulse");
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
      buttonOwner: "human-input",
      ledMode: "pulse",
    });
    transport.callbacks?.onLine?.({ type: "button_down" });
    expect(useButtonStore.getState().rawPressed).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);
  });
});
