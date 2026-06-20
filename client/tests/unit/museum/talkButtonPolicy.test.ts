import { describe, expect, it, vi } from "vitest";
import { shouldAutoConnectTalkButton } from "@/museum/talkButton/talkButtonPolicy";

vi.mock("@/settings/councilSettings", () => ({
  getPushToTalk: vi.fn(() => false),
}));

vi.mock("@/serial/bridgeConfig", () => ({
  isBridgeTransportAvailable: vi.fn(() => true),
}));

describe("shouldAutoConnectTalkButton", () => {
  it("requires push-to-talk and bridge transport support", async () => {
    const { getPushToTalk } = await import("@/settings/councilSettings");
    const { isBridgeTransportAvailable } = await import("@/serial/bridgeConfig");

    vi.mocked(getPushToTalk).mockReturnValue(false);
    vi.mocked(isBridgeTransportAvailable).mockReturnValue(true);
    expect(shouldAutoConnectTalkButton()).toBe(false);

    vi.mocked(getPushToTalk).mockReturnValue(true);
    vi.mocked(isBridgeTransportAvailable).mockReturnValue(false);
    expect(shouldAutoConnectTalkButton()).toBe(false);

    vi.mocked(getPushToTalk).mockReturnValue(true);
    vi.mocked(isBridgeTransportAvailable).mockReturnValue(true);
    expect(shouldAutoConnectTalkButton()).toBe(true);
  });
});
