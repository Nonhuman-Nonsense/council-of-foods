import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_TO_TALK_CHANGE_EVENT } from "@/settings/councilSettings";

const store = vi.hoisted(() => ({
  init: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
  reconnectIfStale: vi.fn().mockResolvedValue(undefined),
  bridgeStatus: "disconnected",
}));

vi.mock("@stores/useButtonStore", () => ({
  useButtonStore: {
    getState: () => store,
  },
}));

vi.mock("@/museum/button/buttonPolicy", () => ({
  isMuseumButtonBridgeActive: vi.fn(() => true),
}));

describe("buttonService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.setItem("councilPushToTalk", "true");
    store.bridgeStatus = "disconnected";
  });

  afterEach(async () => {
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.stop();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("starts watchdog and connects when push-to-talk is enabled", async () => {
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.start();

    expect(store.init).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(store.enableAutoReconnect).toHaveBeenCalled();
      expect(store.connect).toHaveBeenCalled();
    });
  });

  it("disconnects when push-to-talk is turned off", async () => {
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.start();

    window.dispatchEvent(
      new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: false }),
    );

    expect(store.disconnect).toHaveBeenCalled();
  });

  it("reconnects when push-to-talk is turned back on", async () => {
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.start();
    vi.clearAllMocks();

    window.dispatchEvent(
      new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: true }),
    );

    await vi.waitFor(() => {
      expect(store.connect).toHaveBeenCalled();
    });
  });

  it("watchdog reconnects when disconnected", async () => {
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.start();
    vi.clearAllMocks();

    await vi.advanceTimersByTimeAsync(2500);

    expect(store.connect).toHaveBeenCalled();
  });

  it("watchdog checks stale sessions while connected", async () => {
    store.bridgeStatus = "connected";
    const { buttonService } = await import("@/museum/button/buttonService");
    buttonService.start();
    vi.clearAllMocks();

    await vi.advanceTimersByTimeAsync(2500);

    expect(store.reconnectIfStale).toHaveBeenCalled();
    expect(store.connect).not.toHaveBeenCalled();
  });
});
