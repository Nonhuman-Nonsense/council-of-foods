import { describe, expect, it } from "vitest";
import {
    ecologitsSamples,
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
        const impacts = estimateImpacts(model, {
            measures: {
                [model.usageMeasure]: sample.units,
                ...(sample.requestSeconds !== null ? { request_seconds: sample.requestSeconds } : {}),
            },
            requests: 1,
        });

        for (const impact of IMPACTS) {
            const [low, high] = sample.impacts[impact];
            expectSame(impacts[impact].low, low);
            expectSame(impacts[impact].high, high);
        }
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
