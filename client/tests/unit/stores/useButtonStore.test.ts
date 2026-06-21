import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetButtonStoreForTests, useButtonStore } from "@stores/useButtonStore";

const transport = vi.hoisted(() => ({
  callbacks: null as {
    onStatus?: (status: string, error?: string | null) => void;
    onLine?: (event: { type: string }) => void;
  } | null,
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
  reconnectIfStale: vi.fn().mockResolvedValue(undefined),
  setLedMode: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue("disconnected"),
  isSessionHealthy: vi.fn().mockReturnValue(false),
}));

vi.mock("@/button/transport", () => ({
  ButtonTransport: class MockButtonTransport {
    constructor(callbacks: {
      onStatus?: (status: string, error?: string | null) => void;
      onLine?: (event: { type: string }) => void;
    }) {
      transport.callbacks = callbacks;
    }

    connect = transport.connect;
    disconnect = transport.disconnect;
    enableAutoReconnect = transport.enableAutoReconnect;
    reconnectIfStale = transport.reconnectIfStale;
    setLedMode = transport.setLedMode;
    getStatus = transport.getStatus;
    isSessionHealthy = transport.isSessionHealthy;
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

  it("enables input and syncs LED when setLedMode is pulse", async () => {
    useButtonStore.setState({ bridgeStatus: "connected" });
    await useButtonStore.getState().setLedMode("pulse");
    expect(useButtonStore.getState().buttonInputEnabled).toBe(true);
    expect(transport.setLedMode).toHaveBeenCalledWith("pulse");
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
});
