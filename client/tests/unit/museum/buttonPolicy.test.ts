import { describe, expect, it } from "vitest";
import { shouldAutoConnectButton } from "@/museum/button/buttonPolicy";

describe("shouldAutoConnectButton", () => {
  it("is false when push-to-talk is disabled", () => {
    localStorage.setItem("councilPushToTalk", "false");
    expect(shouldAutoConnectButton()).toBe(false);
  });

  it("is true when push-to-talk is enabled and WebSocket exists", () => {
    localStorage.setItem("councilPushToTalk", "true");
    expect(shouldAutoConnectButton()).toBe(true);
  });
});
