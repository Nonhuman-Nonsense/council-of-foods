import { beforeEach, describe, expect, it } from "vitest";
import type { UsageEvent, UsageRecord } from "@shared/UsageTypes.js";
import { usageEventsCollection, usageTotalsCollection } from "@services/DbService.js";
import { onUsageRecorded, parseChatCompletionUsage, recordUsage } from "@services/UsageService.js";

function dialogue(overrides: Partial<UsageRecord> = {}): UsageRecord {
    return {
        source: "server",
        feature: "dialogue",
        provider: "inworld",
        model: "mistral/mistral-large-3",
        measures: { input_tokens: 100, output_tokens: 40, request_seconds: 1.5 },
        meetingId: 7,
        ...overrides,
    };
}

describe("usage recording", () => {
    beforeEach(async () => {
        await usageEventsCollection?.deleteMany({});
        await usageTotalsCollection?.deleteMany({});
    });

    it("sums raw measures per model into the global and installation totals", async () => {
        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        await recordUsage(dialogue());

        const totals = await usageTotalsCollection?.find({}).sort({ _id: 1 }).toArray();
        expect(totals).toEqual([
            {
                _id: "global|inworld|mistral/mistral-large-3",
                scope: "global",
                provider: "inworld",
                model: "mistral/mistral-large-3",
                requests: 3,
                measures: { input_tokens: 300, output_tokens: 120, request_seconds: 4.5 },
            },
            {
                _id: "installation:museum-oslo|inworld|mistral/mistral-large-3",
                scope: "installation:museum-oslo",
                provider: "inworld",
                model: "mistral/mistral-large-3",
                requests: 2,
                measures: { input_tokens: 200, output_tokens: 80, request_seconds: 3 },
            },
        ]);
        expect(await usageEventsCollection?.countDocuments()).toBe(3);
    });

    it("stores nothing when a call reports no positive usage", async () => {
        await recordUsage(dialogue({ measures: { output_tokens: 0, input_tokens: Number.NaN } }));

        expect(await usageEventsCollection?.countDocuments()).toBe(0);
        expect(await usageTotalsCollection?.countDocuments()).toBe(0);
    });

    it("notifies live subscribers once the usage is stored", async () => {
        const seen: UsageEvent[] = [];
        const unsubscribe = onUsageRecorded((event) => seen.push(event));

        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        unsubscribe();
        await recordUsage(dialogue());

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ installationId: "museum-oslo", measures: { output_tokens: 40 } });
    });
});

describe("parseChatCompletionUsage", () => {
    it.each([
        {
            name: "router response",
            usage: { prompt_tokens: 9, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 }, total_tokens: 21 },
            expected: { input_tokens: 9, output_tokens: 12 },
        },
        {
            name: "cached, reasoning and audio details",
            usage: {
                prompt_tokens: 50,
                completion_tokens: 30,
                prompt_tokens_details: { cached_tokens: 20, audio_tokens: 5 },
                completion_tokens_details: { reasoning_tokens: 10, audio_tokens: 8 },
            },
            expected: {
                input_tokens: 50,
                output_tokens: 30,
                cached_input_tokens: 20,
                input_audio_tokens: 5,
                reasoning_tokens: 10,
                output_audio_tokens: 8,
            },
        },
        { name: "missing usage", usage: undefined, expected: {} },
        { name: "unexpected shape", usage: "12 tokens", expected: {} },
    ])("reads $name", ({ usage, expected }) => {
        expect(parseChatCompletionUsage(usage)).toEqual(expected);
    });
});
