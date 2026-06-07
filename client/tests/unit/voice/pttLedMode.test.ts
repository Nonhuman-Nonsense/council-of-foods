import { describe, expect, it } from "vitest";
import { computePttLedMode, isPttInputEnabled } from "@/voice/pttLedMode";

describe("computePttLedMode", () => {
  const ready = {
    pushToTalkMode: true,
    muted: false,
    isConnecting: false,
    voiceError: null,
    pressed: false,
  };

  it("returns off when push-to-talk is disabled or session is unavailable", () => {
    expect(computePttLedMode({ ...ready, pushToTalkMode: false })).toBe("off");
    expect(computePttLedMode({ ...ready, muted: true })).toBe("off");
    expect(computePttLedMode({ ...ready, isConnecting: true })).toBe("off");
    expect(computePttLedMode({ ...ready, voiceError: "Voice guide failed" })).toBe("off");
  });

  it("returns pulse when ready and the button is up", () => {
    expect(computePttLedMode(ready)).toBe("pulse");
  });

  it("returns on when ready and the button is pressed", () => {
    expect(computePttLedMode({ ...ready, pressed: true })).toBe("on");
  });
});

describe("isPttInputEnabled", () => {
  it("is enabled only in pulse and on modes", () => {
    expect(isPttInputEnabled("off")).toBe(false);
    expect(isPttInputEnabled("pulse")).toBe(true);
    expect(isPttInputEnabled("on")).toBe(true);
  });
});
