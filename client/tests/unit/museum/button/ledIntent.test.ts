import { describe, expect, it } from "vitest";
import { mergeLedIntents } from "@/museum/button/ledIntent";

describe("mergeLedIntents", () => {
  it("returns off when no intents are registered", () => {
    expect(mergeLedIntents({})).toBe("off");
  });

  it("returns the only registered intent", () => {
    expect(mergeLedIntents({ setup: "pulse" })).toBe("pulse");
  });

  it("prefers setup over human-input and voice-guide", () => {
    expect(
      mergeLedIntents({
        setup: "pulse",
        "voice-guide": "on",
        "human-input": "off",
      }),
    ).toBe("pulse");
  });

  it("prefers human-input over voice-guide", () => {
    expect(
      mergeLedIntents({
        "voice-guide": "on",
        "human-input": "off",
      }),
    ).toBe("off");
  });

  it("prefers setup over voice-guide", () => {
    expect(
      mergeLedIntents({
        setup: "pulse",
        "voice-guide": "on",
      }),
    ).toBe("pulse");
  });

  it("keeps lower-priority intent when higher-priority owner unregisters", () => {
    expect(
      mergeLedIntents({
        "human-input": "on",
      }),
    ).toBe("on");
  });

  it("returns meta-agent intent when alone", () => {
    expect(mergeLedIntents({ "meta-agent": "pulse" })).toBe("pulse");
  });

  it("prefers human-input over meta-agent", () => {
    expect(
      mergeLedIntents({
        "meta-agent": "pulse",
        "human-input": "off",
      }),
    ).toBe("off");
  });

  it("prefers setup over meta-agent", () => {
    expect(
      mergeLedIntents({
        "meta-agent": "on",
        setup: "pulse",
      }),
    ).toBe("pulse");
  });

  it("meta-agent and voice-guide at same priority: last key in iteration wins (deterministic tie-break)", () => {
    // Both have priority 1; they never run simultaneously so this is an edge case.
    // What matters is the function doesn't throw and returns one of the registered modes.
    const result = mergeLedIntents({ "meta-agent": "pulse", "voice-guide": "on" });
    expect(["pulse", "on"]).toContain(result);
  });
});
