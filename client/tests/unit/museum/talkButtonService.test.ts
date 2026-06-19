import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_TO_TALK_CHANGE_EVENT } from "@/settings/councilSettings";

const policyMock = vi.hoisted(() => ({
  shouldAutoConnectTalkButton: vi.fn(() => true),
}));

const storeState = vi.hoisted(() => ({
  serialStatus: "disconnected" as "disconnected" | "connecting" | "connected" | "error",
  init: vi.fn(),
  enableSerialAutoReconnect: vi.fn(),
  connectGrantedPorts: vi.fn().mockResolvedValue(undefined),
  disconnectSerial: vi.fn().mockResolvedValue(undefined),
  reconnectIfStale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/museum/talkButton/talkButtonPolicy", () => policyMock);
vi.mock("@stores/usePushToTalkStore", () => ({
  usePushToTalkStore: {
    getState: () => storeState,
  },
}));

describe("talkButtonService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    policyMock.shouldAutoConnectTalkButton.mockReturnValue(true);
    storeState.serialStatus = "disconnected";
    vi.resetModules();
  });

  afterEach(async () => {
    const { talkButtonService } = await import("@/museum/talkButton/talkButtonService");
    talkButtonService.stop();
    vi.useRealTimers();
  });

  async function loadService() {
    return import("@/museum/talkButton/talkButtonService");
  }

  it("starts monitoring and connects when push-to-talk is enabled", async () => {
    const { talkButtonService } = await loadService();

    talkButtonService.start();

    expect(storeState.init).toHaveBeenCalled();
    expect(storeState.enableSerialAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectGrantedPorts).toHaveBeenCalled();
  });

  it("retries from the watchdog when disconnected", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectGrantedPorts.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.enableSerialAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectGrantedPorts).toHaveBeenCalled();
  });

  it("detects stale connected sessions during watchdog ticks", async () => {
    storeState.serialStatus = "connected";
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectGrantedPorts.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.reconnectIfStale).toHaveBeenCalled();
    expect(storeState.connectGrantedPorts).not.toHaveBeenCalled();
  });

  it("does not retry while already connecting", async () => {
    storeState.serialStatus = "connecting";
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectGrantedPorts.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.connectGrantedPorts).not.toHaveBeenCalled();
  });

  it("pauses auto-connect and disconnects on staff pause", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();

    talkButtonService.pause();

    expect(storeState.disconnectSerial).toHaveBeenCalled();
    storeState.connectGrantedPorts.mockClear();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(storeState.connectGrantedPorts).not.toHaveBeenCalled();
  });

  it("resumes auto-connect when push-to-talk is enabled again", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectGrantedPorts.mockClear();

    window.dispatchEvent(new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: true }));

    expect(storeState.enableSerialAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectGrantedPorts).toHaveBeenCalled();
  });

  it("pauses when push-to-talk is disabled", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();

    window.dispatchEvent(new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: false }));

    expect(storeState.disconnectSerial).toHaveBeenCalled();
  });
});
