import type { StoredMeeting } from "@models/DBModels.js";
import type { UsageTotalsRow } from "@shared/MeterTypes.js";
import { USAGE_MEASURES, type UsageEvent, type UsageMeasures, type UsageRecord } from "@shared/UsageTypes.js";

import { usageEventsCollection } from "@services/DbService.js";
import { meterEvents } from "@services/meterEvents.js";
import { Logger } from "@utils/Logger.js";

/**
 * Records every AI call's raw usage for the footprint meter (docs/ai-footprint-meter.md).
 *
 * Recording is a side channel: it never throws and callers never await it on the
 * meeting's critical path — a meeting must not stall or fail because usage could
 * not be written.
 */

/** The meeting fields a usage record is tagged with, and the message it was for when known. */
export function usageTagsFor(
    meeting: Pick<StoredMeeting, "_id" | "venueId">,
    messageIndex?: number,
): Pick<UsageRecord, "meetingId" | "venueId" | "messageIndex"> {
    return {
        meetingId: meeting._id,
        ...(meeting.venueId ? { venueId: meeting.venueId } : {}),
        ...(messageIndex !== undefined && messageIndex >= 0 ? { messageIndex } : {}),
    };
}

/** Keeps only finite, positive numbers, so a malformed or empty report stores nothing. */
function cleanMeasures(measures: UsageMeasures): UsageMeasures {
    const cleaned: UsageMeasures = {};
    for (const [measure, value] of Object.entries(measures) as [keyof UsageMeasures, number | undefined][]) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            cleaned[measure] = value;
        }
    }
    return cleaned;
}

export async function recordUsage(record: UsageRecord): Promise<void> {
    const measures = cleanMeasures(record.measures);
    // No database (unit tests, or before initDb): nothing to record into.
    if (Object.keys(measures).length === 0 || !usageEventsCollection) {
        return;
    }

    const event: UsageEvent = { ...record, measures, ts: new Date() };
    try {
        await usageEventsCollection.insertOne({ ...event });
    } catch (error) {
        void Logger.warn("usage", `Failed to record ${record.feature} usage (${record.provider}/${record.model})`, {
            error,
            from: record.meetingId !== undefined ? { meetingId: record.meetingId } : undefined,
        });
        return;
    }
    meterEvents.emit("usage", event);
}

/**
 * Gives a setup's usage the meeting it led to, so the meeting's totals include the conversation
 * that set it up. Side channel, like recording: never throws.
 */
export async function linkSetupUsage(setupId: string, meetingId: number): Promise<void> {
    if (!usageEventsCollection) return;
    try {
        await usageEventsCollection.updateMany({ setupId, meetingId: { $exists: false } }, { $set: { meetingId } });
    } catch (error) {
        void Logger.warn("usage", `Failed to link setup usage to meeting ${meetingId}`, { error, from: { meetingId } });
    }
}

interface ChatCompletionUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; audio_tokens?: number } | null;
    completion_tokens_details?: { reasoning_tokens?: number; audio_tokens?: number } | null;
}

/**
 * Reads an OpenAI-compatible `usage` block — what the Inworld router returns for every
 * routed model, and what OpenAI returns directly. Unknown shapes yield no measures.
 */
export function parseChatCompletionUsage(usage: unknown): UsageMeasures {
    if (!usage || typeof usage !== "object") {
        return {};
    }
    const u = usage as ChatCompletionUsage;
    return cleanMeasures({
        input_tokens: u.prompt_tokens,
        output_tokens: u.completion_tokens,
        cached_input_tokens: u.prompt_tokens_details?.cached_tokens,
        input_audio_tokens: u.prompt_tokens_details?.audio_tokens,
        reasoning_tokens: u.completion_tokens_details?.reasoning_tokens,
        output_audio_tokens: u.completion_tokens_details?.audio_tokens,
    });
}

/**
 * Upper bounds for one realtime response, far above anything a real turn produces. Client
 * reports are clamped to these, so a forged report can inflate the meter only so far.
 */
export const REALTIME_RESPONSE_LIMITS: UsageMeasures = {
    input_tokens: 200_000,
    output_tokens: 20_000,
    cached_input_tokens: 200_000,
    reasoning_tokens: 20_000,
    input_audio_tokens: 200_000,
    output_audio_tokens: 50_000,
    characters: 50_000,
    audio_seconds: 3_600,
};

const MAX_MODEL_NAME_LENGTH = 100;

type RealtimeUsagePart = Pick<UsageRecord, "provider" | "model" | "measures">;

function clampMeasures(measures: UsageMeasures): UsageMeasures {
    const clamped = cleanMeasures(measures);
    for (const measure of Object.keys(clamped) as (keyof UsageMeasures)[]) {
        const limit = REALTIME_RESPONSE_LIMITS[measure];
        if (limit !== undefined) {
            clamped[measure] = Math.min(clamped[measure] as number, limit);
        }
    }
    return clamped;
}

function modelName(block: unknown): string | undefined {
    const model = (block as { model?: unknown } | undefined)?.model;
    return typeof model === "string" && model.length > 0 && model.length <= MAX_MODEL_NAME_LENGTH ? model : undefined;
}

/**
 * Reads the `usage` of an Inworld realtime `response.done`, which splits one response into
 * the language model, speech synthesis and speech recognition it used:
 *
 *   { input_tokens, output_tokens, input_token_details, output_token_details,
 *     llm: { model }, tts: { model, characters, audio_seconds }, stt: { model, audio_seconds } }
 *
 * Each part with a model and positive usage becomes one record; anything else is ignored.
 */
export function parseRealtimeUsage(usage: unknown): RealtimeUsagePart[] {
    if (!usage || typeof usage !== "object") {
        return [];
    }
    const u = usage as {
        input_tokens?: number;
        output_tokens?: number;
        input_token_details?: { cached_tokens?: number; audio_tokens?: number };
        output_token_details?: { reasoning_tokens?: number; audio_tokens?: number };
        llm?: unknown;
        tts?: { characters?: number; audio_seconds?: number };
        stt?: { audio_seconds?: number };
    };

    const parts: RealtimeUsagePart[] = [
        {
            provider: "inworld",
            model: modelName(u.llm) ?? "",
            measures: clampMeasures({
                input_tokens: u.input_tokens,
                output_tokens: u.output_tokens,
                cached_input_tokens: u.input_token_details?.cached_tokens,
                input_audio_tokens: u.input_token_details?.audio_tokens,
                reasoning_tokens: u.output_token_details?.reasoning_tokens,
                output_audio_tokens: u.output_token_details?.audio_tokens,
            }),
        },
        {
            provider: "inworld",
            model: modelName(u.tts) ?? "",
            measures: clampMeasures({ characters: u.tts?.characters, audio_seconds: u.tts?.audio_seconds }),
        },
        {
            provider: "inworld",
            model: modelName(u.stt) ?? "",
            measures: clampMeasures({ audio_seconds: u.stt?.audio_seconds }),
        },
    ];
    return parts.filter((part) => part.model !== "" && Object.keys(part.measures).length > 0);
}

/**
 * Summed usage per model of the events matching `filter`: everything, a venue or a meeting.
 * `byMessage` splits a meeting's rows per message too, so the meter can count each message
 * once it has been played. Summed on read rather than kept as running totals — fast enough at
 * installation scale, and any total can be recomputed from the event log.
 */
export async function getUsageTotals(
    filter: { venueId?: string; meetingId?: number; setupId?: string } = {},
    { byMessage = false }: { byMessage?: boolean } = {},
): Promise<UsageTotalsRow[]> {
    const events = usageEventsCollection;
    if (!events) return [];
    const measureSums = Object.fromEntries(USAGE_MEASURES.map((m) => [m, { $sum: `$measures.${m}` }]));
    const key = { provider: "$provider", model: "$model", ...(byMessage ? { messageIndex: "$messageIndex" } : {}) };
    const groups = await events.aggregate<{
        _id: { provider: string; model: string; messageIndex?: number | null };
        requests: number;
        lastUsedAt: Date;
    } & Record<string, number>>([
        { $match: filter },
        { $group: { _id: key, requests: { $sum: 1 }, lastUsedAt: { $max: "$ts" }, ...measureSums } },
        { $sort: { "_id.provider": 1, "_id.model": 1, "_id.messageIndex": 1 } },
    ]).toArray();
    return groups.map((group) => ({
        provider: group._id.provider,
        model: group._id.model,
        requests: group.requests,
        measures: cleanMeasures(Object.fromEntries(USAGE_MEASURES.map((m) => [m, group[m]]))),
        lastUsedAt: group.lastUsedAt.toISOString(),
        ...(typeof group._id.messageIndex === "number" ? { messageIndex: group._id.messageIndex } : {}),
    }));
}
