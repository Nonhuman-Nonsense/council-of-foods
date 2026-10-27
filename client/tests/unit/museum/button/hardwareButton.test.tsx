import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import HardwareButton from "@/museum/button/HardwareButton";
import { isButtonBridgeAvailable } from "@/museum/button/buttonBridge";

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

/**
 * Whether the bridge runs at all is Main's call (`pttHardwareEnabled`); these
 * cover what the component does once mounted.
 */
describe("HardwareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isButtonBridgeAvailable).mockReturnValue(true);
  });

  it("connects to the bridge and enables auto-reconnect", () => {
    render(<HardwareButton />);

    expect(store.enableAutoReconnect).toHaveBeenCalled();
    expect(store.connect).toHaveBeenCalled();
  });

  it("stays disconnected where no bridge exists", () => {
    vi.mocked(isButtonBridgeAvailable).mockReturnValue(false);

    render(<HardwareButton />);

    expect(store.connect).not.toHaveBeenCalled();
    expect(store.disconnect).toHaveBeenCalled();
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<HardwareButton />);
    vi.clearAllMocks();

    unmount();

    expect(store.disconnect).toHaveBeenCalled();
  });
});
