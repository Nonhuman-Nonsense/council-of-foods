import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedSerialLine } from "@/serial/protocol";
import type { SerialTransportCallbacks, SerialTransportStatus } from "@/serial/transport";

const transportCallbacks: SerialTransportCallbacks = {};

const mockTransport = {
  requestPort: vi.fn().mockResolvedValue(undefined),
  connectGrantedPorts: vi.fn().mockResolvedValue(false),
  disconnect: vi.fn().mockResolvedValue(undefined),
  setLedMode: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/serial/transport", () => ({
  isWebSerialSupported: () => true,
  SerialPushToTalkTransport: class MockSerialPushToTalkTransport {
    requestPort = mockTransport.requestPort;
    connectGrantedPorts = mockTransport.connectGrantedPorts;
    disconnect = mockTransport.disconnect;
    setLedMode = mockTransport.setLedMode;

    constructor(callbacks: SerialTransportCallbacks) {
      Object.assign(transportCallbacks, callbacks);
    }
  },
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
      delete transportCallbacks[key as keyof SerialTransportCallbacks];
    }

    vi.resetModules();
    const mod = await import("@stores/usePushToTalkStore");
    usePushToTalkStore = mod.usePushToTalkStore;
    usePushToTalkStore.setState({
      pressed: false,
      ledMode: "off",
      pttInputEnabled: false,
      serialStatus: "disconnected",
      serialError: null,
      lastSerialLine: null,
      keyboardActive: false,
    });
  });

  function emitLine(event: ParsedSerialLine): void {
    transportCallbacks.onLine?.(event);
  }

  function emitStatus(status: SerialTransportStatus, error: string | null = null): void {
    transportCallbacks.onStatus?.(status, error);
  }

  async function initTransport(): Promise<void> {
    await usePushToTalkStore.getState().connectGrantedPorts();
  }

  it("maps serial PTT events to pressed state when input is enabled", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PTT_DOWN");

    emitLine({ type: "ptt_up" });
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PTT_UP");
  });

  it("ignores serial PTT events when LED mode is off", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("off");

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(false);
  });

  it("records PONG and unknown serial lines", async () => {
    await initTransport();

    emitLine({ type: "pong" });
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PONG");

    transportCallbacks.onRawLine?.("DEBUG");
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("DEBUG");
  });

  it("restores PTT input and LED mode when serial reconnects", async () => {
    await initTransport();
    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");
    expect(usePushToTalkStore.getState().pttInputEnabled).toBe(true);

    emitStatus("disconnected", "USB disconnected");
    expect(usePushToTalkStore.getState().pttInputEnabled).toBe(false);
    expect(usePushToTalkStore.getState().ledMode).toBe("pulse");

    emitStatus("connected");
    expect(usePushToTalkStore.getState().pttInputEnabled).toBe(true);
    expect(mockTransport.setLedMode).toHaveBeenCalledWith("pulse");
  });
  it("tracks serial connection status and errors", async () => {
    await initTransport();

    emitStatus("connecting");
    emitStatus("connected");
    emitStatus("error", "USB unplugged");

    expect(usePushToTalkStore.getState().serialStatus).toBe("error");
    expect(usePushToTalkStore.getState().serialError).toBe("USB unplugged");
  });

  it("clears pressed when serial disconnects or errors", async () => {
    await initTransport();

    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");
    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);

    emitStatus("disconnected");
    expect(usePushToTalkStore.getState().pressed).toBe(false);

    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("on");
    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);

    emitStatus("error", "Serial read failed");
    expect(usePushToTalkStore.getState().pressed).toBe(false);
  });

  it("sends LED mode commands only when serial is connected", async () => {
    await initTransport();

    await usePushToTalkStore.getState().setLedMode("pulse");
    expect(mockTransport.setLedMode).not.toHaveBeenCalled();

    emitStatus("connected");
    await usePushToTalkStore.getState().setLedMode("pulse");
    await usePushToTalkStore.getState().setLedMode("on");
    await usePushToTalkStore.getState().setLedMode("off");

    expect(mockTransport.setLedMode).toHaveBeenCalledWith("pulse");
    expect(mockTransport.setLedMode).toHaveBeenCalledWith("on");
    expect(mockTransport.setLedMode).toHaveBeenCalledWith("off");
  });

  it("uses space as keyboard push-to-talk only when input is enabled", async () => {
    getPushToTalkMock.mockReturnValue(true);
    usePushToTalkStore.getState().init();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    expect(usePushToTalkStore.getState().pressed).toBe(false);

    await usePushToTalkStore.getState().setLedMode("pulse");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    expect(usePushToTalkStore.getState().pressed).toBe(true);
    expect(usePushToTalkStore.getState().keyboardActive).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true }));
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    expect(usePushToTalkStore.getState().keyboardActive).toBe(false);
  });

  it("ignores space when typing in form fields", () => {
    getPushToTalkMock.mockReturnValue(true);
    usePushToTalkStore.getState().init();
    void usePushToTalkStore.getState().setLedMode("pulse");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    document.body.removeChild(input);
  });

  it("auto-connects granted ports on init when push-to-talk is enabled", () => {
    getPushToTalkMock.mockReturnValue(true);
    usePushToTalkStore.getState().init();

    expect(mockTransport.connectGrantedPorts).toHaveBeenCalled();
  });

  it("disconnects serial and clears pressed on dispose", async () => {
    await initTransport();
    await usePushToTalkStore.getState().setLedMode("on");
    usePushToTalkStore.getState().setPressed(true, "keyboard");

    usePushToTalkStore.getState().dispose();

    expect(mockTransport.disconnect).toHaveBeenCalled();
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    expect(usePushToTalkStore.getState().ledMode).toBe("off");
  });
});
