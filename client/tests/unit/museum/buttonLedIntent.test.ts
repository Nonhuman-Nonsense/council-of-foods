import { describe, expect, it } from "vitest";
import { mergeLedIntents } from "@/museum/button/buttonLedIntent";

describe("mergeLedIntents", () => {
  it("returns off when no intents are registered", () => {
    expect(mergeLedIntents({})).toBe("off");
  });

  it("returns the only registered intent", () => {
    expect(mergeLedIntents({ setup: "pulse" })).toBe("pulse");
  });

  it("prefers human-input over voice-guide and setup", () => {
    expect(
      mergeLedIntents({
        setup: "pulse",
        "voice-guide": "on",
        "human-input": "off",
      }),
    ).toBe("off");
  });

  it("prefers voice-guide over setup", () => {
    expect(
      mergeLedIntents({
        setup: "pulse",
        "voice-guide": "on",
      }),
    ).toBe("on");
  });

  it("keeps lower-priority intent when higher-priority owner unregisters", () => {
    expect(
      mergeLedIntents({
        setup: "pulse",
      }),
    ).toBe("pulse");
  });
});
