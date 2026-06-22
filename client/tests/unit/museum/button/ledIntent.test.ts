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
});
