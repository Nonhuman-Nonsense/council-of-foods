import { describe, expect, it } from "vitest";
import {
    ecologitsSamples,
    estimateEcologitsImpacts,
    estimateEcologitsManufacturing,
    estimateGpuSeconds,
    estimateImpacts,
    estimateManufacturing,
    findEcologitsModel,
    HARDWARE,
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
        const cap = sample.requestSeconds ?? Number.POSITIVE_INFINITY;
        const impacts = estimateEcologitsImpacts(model, sample.units, 1, cap);
        const manufacturing = estimateEcologitsManufacturing(model, sample.units, 1, cap);

        for (const impact of IMPACTS) {
            expectSame(impacts[impact].low, sample.impacts[impact][0]);
            expectSame(impacts[impact].high, sample.impacts[impact][1]);
            expectSame(manufacturing[impact].low, sample.manufacturing[impact][0]);
            expectSame(manufacturing[impact].high, sample.manufacturing[impact][1]);
        }
    });

    // EcoLogits spreads one GPU's and one server's manufacturing over the GPU's lifetime: so
    // the minerals of any usage, divided by the GPU time it occupied, is the same for every
    // model. If it is not, the GPU time is not measuring what the mineral figure is built on.
    it.each(listEcologitsModels().map(([key, model]) => ({ key, model })))(
        "puts $key's minerals on the GPU time it occupied",
        ({ model }) => {
            const usage = { measures: { [model.usageMeasure]: 400 }, requests: 3 };
            const minerals = estimateManufacturing(model, usage).adpe;
            const gpuSeconds = estimateGpuSeconds(model, usage);
            // EcoLogits 0.11.1: a server without GPUs 0.37 kg Sb eq, shared by 8 GPUs; an H100 0.00895 kg Sb eq.
            const perGpuSecond = (0.37 / 8 + 0.00895) / HARDWARE.lifetimeSeconds;

            expectSame(minerals.low, gpuSeconds.low * perGpuSecond);
            expectSame(minerals.high, gpuSeconds.high * perGpuSecond);
        },
    );

    it.each([
        { key: "inworld|inworld-tts-1.5-max", measures: { audio_seconds: 30 }, units: 30, cap: 30 },
        { key: "inworld|mistral/mistral-large-3", measures: { output_tokens: 400 }, units: 400, cap: Infinity },
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
