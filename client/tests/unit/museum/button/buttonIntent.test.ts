import { describe, expect, it } from "vitest";
import {
  mergeButtonOwner,
  resolveAppliedLedMode,
  type ButtonClaims,
  type ButtonLedModes,
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

  it("prefers setup over human-input", () => {
    expect(
      mergeButtonOwner({
        setup: true,
        "human-input": true,
      }),
    ).toBe("setup");
  });

  it("lets meta-agent win when human-input has not claimed", () => {
    expect(mergeButtonOwner({ "meta-agent": true })).toBe("meta-agent");
  });

  it("competes with off LED — claim alone determines ownership", () => {
    const claims: ButtonClaims = { "meta-agent": true, "human-input": true };
    expect(mergeButtonOwner(claims)).toBe("human-input");
  });
});

describe("resolveAppliedLedMode", () => {
  it("returns off when there is no buttonOwner", () => {
    expect(resolveAppliedLedMode({}, null)).toBe("off");
  });

  it("returns the buttonOwner LED preference", () => {
    const ledModes: ButtonLedModes = { "human-input": "pulse" };
    expect(resolveAppliedLedMode(ledModes, "human-input")).toBe("pulse");
  });

  it("returns off when buttonOwner has no LED preference yet", () => {
    expect(resolveAppliedLedMode({}, "meta-agent")).toBe("off");
  });

  it("uses winner LED when setup displaces human-input", () => {
    const ledModes: ButtonLedModes = {
      "human-input": "on",
      setup: "pulse",
    };
    expect(resolveAppliedLedMode(ledModes, "setup")).toBe("pulse");
  });

  it("allows buttonOwner with off LED preference", () => {
    const ledModes: ButtonLedModes = { "meta-agent": "off" };
    expect(resolveAppliedLedMode(ledModes, "meta-agent")).toBe("off");
  });
});
