import { describe, it, expect } from "vitest";
import { mergeRealtimeSessionWithClientConfig } from "@realtime/realtimeProtocol";
import type { RealtimeSessionServerDefaults } from "@realtime/realtimeProtocol";
import type { RealtimeTool } from "@voice/guideTools";

const defaults: RealtimeSessionServerDefaults = {
  type: "realtime",
  model: "m1",
  output_modalities: ["audio", "text"],
  audio: {
    input: {
      transcription: { model: "stt" },
      turn_detection: {
        type: "semantic_vad",
        eagerness: "medium",
        create_response: true,
        interrupt_response: true,
      },
    },
    output: { voice: "v1", model: "tts1", speed: 1 },
  },
};

describe("mergeRealtimeSessionWithClientConfig", () => {
  it("merges server defaults with client instructions and tools", () => {
    const tools: RealtimeTool[] = [
      { type: "function", name: "x", description: "d", parameters: { type: "object" } },
    ];
    const merged = mergeRealtimeSessionWithClientConfig(defaults, "sys", tools);
    expect(merged.model).toBe("m1");
    expect(merged.instructions).toBe("sys");
    expect(merged.tools).toBe(tools);
    expect(merged.audio.output?.voice).toBe("v1");
  });

  it("preserves providerData from server defaults", () => {
    const withProviderData: RealtimeSessionServerDefaults = {
      ...defaults,
      providerData: {
        tts: { language: "sv" },
      },
    };
    const merged = mergeRealtimeSessionWithClientConfig(withProviderData, "sys", []);
    expect(merged.providerData).toEqual({ tts: { language: "sv" } });
  });
});
