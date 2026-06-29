import { describe, expect, it } from "vitest";
import {
  computeShowHoldToSpeakHint,
  BUTTON_IDLE_REMIND_MS,
  shouldShowIdleRemind,
} from "@voice/useHoldToSpeakHint";

describe("computeShowHoldToSpeakHint", () => {
  const base = {
    agentMode: "ptt",
    sessionActive: true,
    isConnecting: false,
    micOpen: false,
    dismissedAfterFirstPtt: false,
    idleRemindVisible: false,
  };

  it("shows the hint before the first PTT press", () => {
    expect(computeShowHoldToSpeakHint(base)).toBe(true);
  });

  it("hides while the button is pressed", () => {
    expect(computeShowHoldToSpeakHint({ ...base, micOpen: true })).toBe(false);
  });

  it("hides after the first PTT until idle remind", () => {
    expect(
      computeShowHoldToSpeakHint({
        ...base,
        dismissedAfterFirstPtt: true,
      }),
    ).toBe(false);
  });

  it("shows again after idle remind", () => {
    expect(
      computeShowHoldToSpeakHint({
        ...base,
        dismissedAfterFirstPtt: true,
        idleRemindVisible: true,
      }),
    ).toBe(true);
  });
});

describe("shouldShowIdleRemind", () => {
  it("does not remind before the first PTT", () => {
    expect(shouldShowIdleRemind(false, 0, BUTTON_IDLE_REMIND_MS)).toBe(false);
  });

  it("reminds after the idle window", () => {
    expect(shouldShowIdleRemind(true, 0, BUTTON_IDLE_REMIND_MS)).toBe(true);
    expect(shouldShowIdleRemind(true, 0, BUTTON_IDLE_REMIND_MS - 1)).toBe(false);
  });
});
