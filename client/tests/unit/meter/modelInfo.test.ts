import { describe, expect, it } from "vitest";
import { findEcologitsModel, listEcologitsModels } from "@shared/footprint/ecologits";
import { MODEL_ROLES, ZONE_NAMES, modelActivity } from "@/meter/modelInfo";

describe("meter model info", () => {
  it.each(listEcologitsModels().map(([id, model]) => ({ id, model })))(
    "describes $id's role and place for visitors",
    ({ id, model }) => {
      expect(MODEL_ROLES[id]).toBeDefined();
      for (const zone of model.datacenterZones) expect(ZONE_NAMES[zone]).toBeDefined();
    },
  );

  it.each([
    { provider: "inworld", model: "mistral/mistral-large-3", activity: "writing" },
    { provider: "inworld", model: "google-ai-studio/gemini-2.5-flash", activity: "thinking" },
    { provider: "inworld", model: "inworld-tts-1.5-max", activity: "speaking" },
    { provider: "inworld", model: "soniox/stt-rt-v4", activity: "listening" },
  ])("shows $model as $activity", ({ provider, model, activity }) => {
    expect(modelActivity(`${provider}|${model}`, findEcologitsModel(provider, model)!)).toBe(activity);
  });
});
