import { describe, expect, it } from "vitest";
import { computeButtonLedMode, isButtonInputEnabled } from "@/museum/button/ledMode";

describe("buttonLedMode", () => {
  it("returns off when push-to-talk is disabled", () => {
    expect(
      computeButtonLedMode({
        pushToTalkMode: false,
        muted: false,
        isConnecting: false,
        voiceError: null,
        pressed: false,
      }),
    ).toBe("off");
  });

  it("returns pulse when ready and not pressed", () => {
    expect(
      computeButtonLedMode({
        pushToTalkMode: true,
        muted: false,
        isConnecting: false,
        voiceError: null,
        pressed: false,
      }),
    ).toBe("pulse");
  });

  it("returns on while pressed", () => {
    expect(
      computeButtonLedMode({
        pushToTalkMode: true,
        muted: false,
        isConnecting: false,
        voiceError: null,
        pressed: true,
      }),
    ).toBe("on");
  });

  it("enables input for pulse and on modes", () => {
    expect(isButtonInputEnabled("pulse")).toBe(true);
    expect(isButtonInputEnabled("on")).toBe(true);
    expect(isButtonInputEnabled("off")).toBe(false);
  });
});
