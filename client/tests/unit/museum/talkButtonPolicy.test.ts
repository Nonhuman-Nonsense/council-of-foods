import { describe, expect, it, vi } from "vitest";
import { shouldAutoConnectTalkButton } from "@/museum/talkButton/talkButtonPolicy";

vi.mock("@/settings/councilSettings", () => ({
  getPushToTalk: vi.fn(() => false),
}));

vi.mock("@/serial/transport", () => ({
  isWebSerialSupported: vi.fn(() => true),
}));

describe("shouldAutoConnectTalkButton", () => {
  it("requires push-to-talk and Web Serial support", async () => {
    const { getPushToTalk } = await import("@/settings/councilSettings");
    const { isWebSerialSupported } = await import("@/serial/transport");

    vi.mocked(getPushToTalk).mockReturnValue(false);
    vi.mocked(isWebSerialSupported).mockReturnValue(true);
    expect(shouldAutoConnectTalkButton()).toBe(false);

    vi.mocked(getPushToTalk).mockReturnValue(true);
    vi.mocked(isWebSerialSupported).mockReturnValue(false);
    expect(shouldAutoConnectTalkButton()).toBe(false);

    vi.mocked(getPushToTalk).mockReturnValue(true);
    vi.mocked(isWebSerialSupported).mockReturnValue(true);
    expect(shouldAutoConnectTalkButton()).toBe(true);
  });
});
