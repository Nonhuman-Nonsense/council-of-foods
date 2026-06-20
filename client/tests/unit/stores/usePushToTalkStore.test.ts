import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedSerialLine } from "@shared/pttProtocol";
import type { PttTransportCallbacks, PttTransportStatus } from "@/ptt/bridgeTransport";

const transportCallbacks: PttTransportCallbacks = {};

const mockTransport = {
  connect: vi.fn().mockResolvedValue(false),
  disconnect: vi.fn().mockResolvedValue(undefined),
  setLedMode: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
  isSessionHealthy: vi.fn(() => true),
};

vi.mock("@/ptt/bridgeTransport", () => ({
  BridgePttTransport: class MockBridgePttTransport {
    connect = mockTransport.connect;
    disconnect = mockTransport.disconnect;
    setLedMode = mockTransport.setLedMode;
    enableAutoReconnect = mockTransport.enableAutoReconnect;
    isSessionHealthy = mockTransport.isSessionHealthy;

    constructor(callbacks: PttTransportCallbacks) {
      Object.assign(transportCallbacks, callbacks);
    }
  },
}));

vi.mock("@/ptt/bridgeConfig", () => ({
  isBridgeTransportAvailable: () => true,
}));

const getPushToTalkMock = vi.fn(() => false);

vi.mock("@/settings/councilSettings", () => ({
  getPushToTalk: () => getPushToTalkMock(),
}));

type PushToTalkStore = typeof import("@stores/usePushToTalkStore").usePushToTalkStore;

describe("usePushToTalkStore", () => {
  let usePushToTalkStore: PushToTalkStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    getPushToTalkMock.mockReturnValue(false);
    for (const key of Object.keys(transportCallbacks)) {
      delete transportCallbacks[key as keyof PttTransportCallbacks];
    }

    vi.resetModules();
    const mod = await import("@stores/usePushToTalkStore");
    usePushToTalkStore = mod.usePushToTalkStore;
    usePushToTalkStore.setState({
      pressed: false,
      rawPressed: false,
      ledMode: "off",
      pttInputEnabled: false,
      bridgeStatus: "disconnected",
      bridgeError: null,
      keyboardActive: false,
    });
  });

  function emitLine(event: ParsedSerialLine): void {
    transportCallbacks.onLine?.(event);
  }

  function emitStatus(status: PttTransportStatus, error: string | null = null): void {
    transportCallbacks.onStatus?.(status, error);
  }

  async function initTransport(): Promise<void> {
    await usePushToTalkStore.getState().connectTalkButton();
  }

  it("maps PTT events to pressed state when input is enabled", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);

    emitLine({ type: "ptt_up" });
    expect(usePushToTalkStore.getState().pressed).toBe(false);
  });

  it("tracks rawPressed even when ptt input is disabled", async () => {
    await initTransport();
    emitStatus("connected");

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().rawPressed).toBe(true);
    expect(usePushToTalkStore.getState().pressed).toBe(false);

    emitLine({ type: "ptt_up" });
    expect(usePushToTalkStore.getState().rawPressed).toBe(false);
  });

  it("enables pressed when led mode turns on while button is held", async () => {
    await initTransport();
    emitStatus("connected");

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().rawPressed).toBe(true);
    expect(usePushToTalkStore.getState().pressed).toBe(false);

    await usePushToTalkStore.getState().setLedMode("pulse");
    expect(usePushToTalkStore.getState().pressed).toBe(true);
  });

  it("clears pressed state on disconnect", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");
    emitLine({ type: "ptt_down" });

    emitStatus("disconnected");
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    expect(usePushToTalkStore.getState().rawPressed).toBe(false);
    expect(usePushToTalkStore.getState().pttInputEnabled).toBe(false);
  });

  it("resyncs LED mode after reconnect when led mode is active", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");
    mockTransport.setLedMode.mockClear();

    emitStatus("connected");
    expect(mockTransport.setLedMode).toHaveBeenCalledWith("pulse");
  });

  it("delegates connect and disconnect to bridge transport", async () => {
    await usePushToTalkStore.getState().connectTalkButton();
    expect(mockTransport.connect).toHaveBeenCalled();

    await usePushToTalkStore.getState().disconnectTalkButton();
    expect(mockTransport.disconnect).toHaveBeenCalled();
  });
});
