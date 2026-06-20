import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_TO_TALK_CHANGE_EVENT } from "@/settings/councilSettings";

const policyMock = vi.hoisted(() => ({
  shouldAutoConnectTalkButton: vi.fn(() => true),
}));

const storeState = vi.hoisted(() => ({
  bridgeStatus: "disconnected" as "disconnected" | "connecting" | "connected" | "error",
  init: vi.fn(),
  enableTalkButtonAutoReconnect: vi.fn(),
  connectTalkButton: vi.fn().mockResolvedValue(undefined),
  disconnectTalkButton: vi.fn().mockResolvedValue(undefined),
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
    storeState.bridgeStatus = "disconnected";
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
    expect(storeState.enableTalkButtonAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectTalkButton).toHaveBeenCalled();
  });

  it("retries from the watchdog when disconnected", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectTalkButton.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.enableTalkButtonAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectTalkButton).toHaveBeenCalled();
  });

  it("detects stale connected sessions during watchdog ticks", async () => {
    storeState.bridgeStatus = "connected";
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectTalkButton.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.reconnectIfStale).toHaveBeenCalled();
    expect(storeState.connectTalkButton).not.toHaveBeenCalled();
  });

  it("does not retry while already connecting", async () => {
    storeState.bridgeStatus = "connecting";
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectTalkButton.mockClear();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(storeState.connectTalkButton).not.toHaveBeenCalled();
  });

  it("pauses auto-connect and disconnects on staff pause", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();

    talkButtonService.pause();

    expect(storeState.disconnectTalkButton).toHaveBeenCalled();
    storeState.connectTalkButton.mockClear();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(storeState.connectTalkButton).not.toHaveBeenCalled();
  });

  it("resumes auto-connect when push-to-talk is enabled again", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();
    storeState.connectTalkButton.mockClear();

    window.dispatchEvent(new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: true }));

    expect(storeState.enableTalkButtonAutoReconnect).toHaveBeenCalled();
    expect(storeState.connectTalkButton).toHaveBeenCalled();
  });

  it("pauses when push-to-talk is disabled", async () => {
    const { talkButtonService } = await loadService();
    talkButtonService.start();

    window.dispatchEvent(new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: false }));

    expect(storeState.disconnectTalkButton).toHaveBeenCalled();
  });
});
