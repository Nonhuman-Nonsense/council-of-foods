import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedSerialLine } from "@/serial/protocol";
import type { SerialTransportCallbacks, SerialTransportStatus } from "@/serial/transport";

const transportCallbacks: SerialTransportCallbacks = {};

const mockTransport = {
  requestPort: vi.fn().mockResolvedValue(undefined),
  connectGrantedPorts: vi.fn().mockResolvedValue(false),
  disconnect: vi.fn().mockResolvedValue(undefined),
  setLed: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/serial/transport", () => ({
  isWebSerialSupported: () => true,
  SerialPushToTalkTransport: class MockSerialPushToTalkTransport {
    requestPort = mockTransport.requestPort;
    connectGrantedPorts = mockTransport.connectGrantedPorts;
    disconnect = mockTransport.disconnect;
    setLed = mockTransport.setLed;

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

  it("maps serial PTT events to pressed state and lastSerialLine", async () => {
    await initTransport();

    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PTT_DOWN");

    emitLine({ type: "ptt_up" });
    expect(usePushToTalkStore.getState().pressed).toBe(false);
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PTT_UP");
  });

  it("records PONG and unknown serial lines", async () => {
    await initTransport();

    emitLine({ type: "pong" });
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("PONG");

    transportCallbacks.onRawLine?.("DEBUG");
    expect(usePushToTalkStore.getState().lastSerialLine).toBe("DEBUG");
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
    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);

    emitStatus("disconnected");
    expect(usePushToTalkStore.getState().pressed).toBe(false);

    emitStatus("connected");
    emitLine({ type: "ptt_down" });
    expect(usePushToTalkStore.getState().pressed).toBe(true);

    emitStatus("error", "Serial read failed");
    expect(usePushToTalkStore.getState().pressed).toBe(false);
  });

  it("does not send LED commands unless serial is connected", async () => {
    await initTransport();

    await usePushToTalkStore.getState().setLed(true);
    expect(mockTransport.setLed).not.toHaveBeenCalled();

    emitStatus("connected");
    await usePushToTalkStore.getState().setLed(true);
    await usePushToTalkStore.getState().setLed(false);

    expect(mockTransport.setLed).toHaveBeenNthCalledWith(1, true);
    expect(mockTransport.setLed).toHaveBeenNthCalledWith(2, false);
  });

  it("uses space as keyboard push-to-talk when enabled", () => {
    getPushToTalkMock.mockReturnValue(true);
    usePushToTalkStore.getState().init();

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
    usePushToTalkStore.getState().setPressed(true, "keyboard");

    usePushToTalkStore.getState().dispose();

    expect(mockTransport.disconnect).toHaveBeenCalled();
    expect(usePushToTalkStore.getState().pressed).toBe(false);
  });
});
