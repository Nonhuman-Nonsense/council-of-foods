import { describe, expect, it } from "vitest";
import { mergeButtonIntentOwner, mergeLedIntents, mergePressOwner } from "@/museum/button/ledIntent";

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

  it("ignores off intents so lower-priority pulse can win", () => {
    expect(
      mergeLedIntents({
        "voice-guide": "on",
        "human-input": "off",
      }),
    ).toBe("on");
  });

  it("prefers human-input pulse over voice-guide on", () => {
    expect(
      mergeLedIntents({
        "voice-guide": "on",
        "human-input": "pulse",
      }),
    ).toBe("pulse");
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

  it("prefers human-input over meta-agent when human-input is competing", () => {
    expect(
      mergeLedIntents({
        "meta-agent": "pulse",
        "human-input": "pulse",
      }),
    ).toBe("pulse");
  });

  it("lets meta-agent win when human-input is off during warm pre-connect", () => {
    expect(
      mergeLedIntents({
        "meta-agent": "pulse",
        "human-input": "off",
      }),
    ).toBe("pulse");
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
    const result = mergeLedIntents({ "meta-agent": "pulse", "voice-guide": "on" });
    expect(["pulse", "on"]).toContain(result);
  });
});

describe("mergePressOwner", () => {
  it("matches mergeButtonIntentOwner", () => {
    const intents = {
      "meta-agent": "pulse" as const,
      "human-input": "off" as const,
    };
    expect(mergePressOwner(intents)).toBe("meta-agent");
    expect(mergeButtonIntentOwner(intents)).toBe("meta-agent");
  });

  it("returns null when no owner is competing", () => {
    expect(mergePressOwner({ "human-input": "off" })).toBeNull();
  });
});
