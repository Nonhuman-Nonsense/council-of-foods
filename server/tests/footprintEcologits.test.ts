import { describe, expect, it } from "vitest";
import {
    ecologitsSamples,
    estimateEcologitsImpacts,
    estimateImpacts,
    findEcologitsModel,
    IMPACTS,
    listEcologitsModels,
} from "@shared/footprint/ecologits.js";
import productionOptions from "../global-options.json" with { type: "json" };

/** Our arithmetic reproduces EcoLogits up to float rounding. */
function expectSame(actual: number, expected: number) {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-9);
}

describe("EcoLogits footprint table", () => {
    const cases = listEcologitsModels().flatMap(([key, model]) =>
        ecologitsSamples(key).map((sample) => ({ key, model, sample, label: `${sample.units} units, ${sample.requestSeconds ?? "unmeasured"}s` }))
    );

    it.each(cases)("reproduces EcoLogits for $key at $label", ({ model, sample }) => {
        const impacts = estimateEcologitsImpacts(
            model,
            sample.units,
            1,
            sample.requestSeconds ?? Number.POSITIVE_INFINITY,
        );

        for (const impact of IMPACTS) {
            const [low, high] = sample.impacts[impact];
            expectSame(impacts[impact].low, low);
            expectSame(impacts[impact].high, high);
        }
    });

    it.each([
        { key: "inworld|inworld-tts-1.5-max", measures: { audio_seconds: 30 }, units: 30, cap: 30 },
        { key: "inworld|mistral/mistral-large-3", measures: { output_tokens: 400, request_seconds: 0.1 }, units: 400, cap: Infinity },
    ])("estimates $key with generation time capped at $cap s", ({ key, measures, units, cap }) => {
        const [provider, model] = key.split("|");
        const entry = findEcologitsModel(provider, model)!;

        expect(estimateImpacts(entry, { measures, requests: 2 }))
            .toEqual(estimateEcologitsImpacts(entry, units, 2, cap));
    });

    it("has an entry for every model production is configured to call", () => {
        const configured = [
            ["inworld", productionOptions.conversationModel],
            ["inworld", productionOptions.speakerClassifierModel],
            ["inworld", productionOptions.inworldVoiceModel],
            ["elevenlabs", productionOptions.elevenlabsVoiceModel],
        ];

        const missing = configured.filter(([provider, model]) => !findEcologitsModel(provider, model));
        expect(missing).toEqual([]);
    });
});
