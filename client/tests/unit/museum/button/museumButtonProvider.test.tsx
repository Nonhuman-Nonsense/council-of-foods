import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { PUSH_TO_TALK_CHANGE_EVENT } from "@/settings/councilSettings";

const store = vi.hoisted(() => ({
  init: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  enableAutoReconnect: vi.fn(),
}));

vi.mock("@/museum/button/buttonStore", () => ({
  useButtonStore: {
    getState: () => store,
  },
}));

vi.mock("@/museum/button/config", () => ({
  isButtonBridgeAvailable: vi.fn(() => true),
}));

describe("MuseumButtonProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("councilAppMode", "museum");
    localStorage.setItem("councilPushToTalk", "true");
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function renderProvider(): Promise<void> {
    const { default: MuseumButtonProvider } = await import("@/museum/button/MuseumButtonProvider");
    render(<MuseumButtonProvider />);
  }

  it("initializes keyboard and connects when museum push-to-talk is active", async () => {
    await renderProvider();

    expect(store.init).toHaveBeenCalled();
    expect(store.enableAutoReconnect).toHaveBeenCalled();
    expect(store.connect).toHaveBeenCalled();
  });

  it("disconnects when push-to-talk is turned off", async () => {
    await renderProvider();
    vi.clearAllMocks();

    window.dispatchEvent(
      new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: false }),
    );

    await vi.waitFor(() => {
      expect(store.disconnect).toHaveBeenCalled();
    });
  });

  it("reconnects when push-to-talk is turned back on", async () => {
    await renderProvider();

    window.dispatchEvent(
      new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: false }),
    );
    await vi.waitFor(() => expect(store.disconnect).toHaveBeenCalled());

    vi.clearAllMocks();
    window.dispatchEvent(
      new CustomEvent(PUSH_TO_TALK_CHANGE_EVENT, { detail: true }),
    );

    await vi.waitFor(() => {
      expect(store.enableAutoReconnect).toHaveBeenCalled();
      expect(store.connect).toHaveBeenCalled();
    });
  });

  it("disconnects on unmount", async () => {
    const { default: MuseumButtonProvider } = await import("@/museum/button/MuseumButtonProvider");
    const { unmount } = render(<MuseumButtonProvider />);
    vi.clearAllMocks();

    unmount();

    expect(store.disconnect).toHaveBeenCalled();
  });

  it("does not connect bridge when not in museum mode but still inits keyboard", async () => {
    localStorage.setItem("councilAppMode", "web");

    await renderProvider();

    expect(store.init).toHaveBeenCalled();
    expect(store.connect).not.toHaveBeenCalled();
    expect(store.disconnect).toHaveBeenCalled();
  });

  it("does not init keyboard when push-to-talk is off", async () => {
    localStorage.setItem("councilPushToTalk", "false");

    await renderProvider();

    expect(store.init).not.toHaveBeenCalled();
    expect(store.connect).not.toHaveBeenCalled();
  });
});
