import { describe, expect, it } from "vitest";
import { APP_MODE_STORAGE_KEY } from "@/museum/appMode";
import { shouldAutoConnectButton } from "@/museum/button/buttonPolicy";

describe("shouldAutoConnectButton", () => {
  it("is false when push-to-talk is disabled", () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, "museum");
    localStorage.setItem("councilPushToTalk", "false");
    expect(shouldAutoConnectButton()).toBe(false);
  });

  it("is false in web mode even when push-to-talk is enabled", () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, "web");
    localStorage.setItem("councilPushToTalk", "true");
    expect(shouldAutoConnectButton()).toBe(false);
  });

  it("is true in museum mode with push-to-talk enabled", () => {
    localStorage.setItem(APP_MODE_STORAGE_KEY, "museum");
    localStorage.setItem("councilPushToTalk", "true");
    expect(shouldAutoConnectButton()).toBe(true);
  });
});
