import { describe, expect, it } from "vitest";
import {
  mergeButtonOwner,
  resolveAppliedArmed,
  resolveLedMode,
  type ButtonArmed,
  type ButtonClaims,
} from "@/museum/button/buttonStore";

describe("mergeButtonOwner", () => {
  it("returns null when no claims are registered", () => {
    expect(mergeButtonOwner({})).toBeNull();
  });

  it("returns the only claimant", () => {
    expect(mergeButtonOwner({ "meta-agent": true })).toBe("meta-agent");
  });

  it("prefers human-input over meta-agent", () => {
    expect(
      mergeButtonOwner({
        "meta-agent": true,
        "human-input": true,
      }),
    ).toBe("human-input");
  });

  it("prefers summary over meta-agent", () => {
    expect(
      mergeButtonOwner({
        "meta-agent": true,
        summary: true,
      }),
    ).toBe("summary");
  });

  it("prefers staff over human-input", () => {
    expect(
      mergeButtonOwner({
        staff: true,
        "human-input": true,
      }),
    ).toBe("staff");
  });

  it("prefers summary over replay", () => {
    expect(
      mergeButtonOwner({
        replay: true,
        summary: true,
      }),
    ).toBe("summary");
  });

  it("lets meta-agent win when human-input has not claimed", () => {
    expect(mergeButtonOwner({ "meta-agent": true })).toBe("meta-agent");
  });

  it("competes with off LED — claim alone determines ownership", () => {
    const claims: ButtonClaims = { "meta-agent": true, "human-input": true };
    expect(mergeButtonOwner(claims)).toBe("human-input");
  });
});

describe("resolveAppliedArmed", () => {
  it("is disarmed when there is no buttonOwner", () => {
    expect(resolveAppliedArmed({}, null)).toBe(false);
  });

  it("follows the routed owner's arming", () => {
    const armed: ButtonArmed = { "human-input": true };
    expect(resolveAppliedArmed(armed, "human-input")).toBe(true);
  });

  it("is disarmed when the owner has not armed yet", () => {
    expect(resolveAppliedArmed({}, "meta-agent")).toBe(false);
  });

  it("ignores a displaced owner's arming — only the winner counts", () => {
    const armed: ButtonArmed = { "human-input": true };
    expect(resolveAppliedArmed(armed, "staff")).toBe(false);
  });
});

describe("resolveLedMode", () => {
  it("is dark while disarmed, whatever the mic wants", () => {
    expect(resolveLedMode(false, false)).toBe("off");
    expect(resolveLedMode(false, true)).toBe("off");
  });

  it("pulses to invite a press when armed and idle", () => {
    expect(resolveLedMode(true, false)).toBe("pulse");
  });

  it("goes solid while the mic is open", () => {
    expect(resolveLedMode(true, true)).toBe("on");
  });
});
