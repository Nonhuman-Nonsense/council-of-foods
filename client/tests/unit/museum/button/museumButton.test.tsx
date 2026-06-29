import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AGENT_MODE_CHANGE_EVENT } from "@/settings/councilSettings";
import React from "react";

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

vi.mock("@/museum/button/buttonBridge", () => ({
  isButtonBridgeAvailable: vi.fn(() => true),
}));

const ledDebugState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/museum/button/buttonDebug", () => ({
  default: () => <div data-testid="button-led-debug-overlay" />,
  useButtonLedDebugOverlay: () => ({
    ledDebugOverlay: ledDebugState.enabled,
    setLedDebugOverlay: vi.fn(),
  }),
}));

describe("MuseumButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("councilAppMode", "museum");
    localStorage.setItem("councilAgentMode", "ptt");
    ledDebugState.enabled = false;
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function renderProvider(): Promise<void> {
    const { default: MuseumButton } = await import("@/museum/button/MuseumButton");
    render(<MuseumButton />);
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
      new CustomEvent(AGENT_MODE_CHANGE_EVENT, { detail: "always-on" }),
    );

    await vi.waitFor(() => {
      expect(store.disconnect).toHaveBeenCalled();
    });
  });

  it("reconnects when push-to-talk is turned back on", async () => {
    await renderProvider();

    window.dispatchEvent(
      new CustomEvent(AGENT_MODE_CHANGE_EVENT, { detail: "always-on" }),
    );
    await vi.waitFor(() => expect(store.disconnect).toHaveBeenCalled());

    vi.clearAllMocks();
    window.dispatchEvent(
      new CustomEvent(AGENT_MODE_CHANGE_EVENT, { detail: "ptt" }),
    );

    await vi.waitFor(() => {
      expect(store.enableAutoReconnect).toHaveBeenCalled();
      expect(store.connect).toHaveBeenCalled();
    });
  });

  it("disconnects on unmount", async () => {
    const { default: MuseumButton } = await import("@/museum/button/MuseumButton");
    const { unmount } = render(<MuseumButton />);
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
    localStorage.setItem("councilAgentMode", "always-on");

    await renderProvider();

    expect(store.init).not.toHaveBeenCalled();
    expect(store.connect).not.toHaveBeenCalled();
  });

  it("renders LED debug overlay when flag is enabled", async () => {
    ledDebugState.enabled = true;

    const { default: MuseumButton } = await import("@/museum/button/MuseumButton");
    const { getByTestId } = render(<MuseumButton />);

    expect(getByTestId("button-led-debug-overlay")).toBeInTheDocument();
  });
});
