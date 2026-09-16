import type { StoredMeeting } from "@models/DBModels.js";
import type { UsageEvent, UsageMeasures, UsageRecord } from "@shared/UsageTypes.js";

import { usageEventsCollection, usageTotalsCollection } from "@services/DbService.js";
import { Logger } from "@utils/Logger.js";

/**
 * Records every AI call's raw usage for the footprint meter (docs/ai-footprint-meter.md).
 *
 * Recording is a side channel: it never throws and callers never await it on the
 * meeting's critical path — a meeting must not stall or fail because usage could
 * not be written.
 */

export const GLOBAL_USAGE_SCOPE = "global";

export function installationUsageScope(installationId: string): string {
    return `installation:${installationId}`;
}

type UsageListener = (event: UsageEvent) => void;
const listeners = new Set<UsageListener>();

/** Subscribe to recorded usage (the live meter). Returns an unsubscribe function. */
export function onUsageRecorded(listener: UsageListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The meeting fields a usage record is tagged with. */
export function usageTagsFor(meeting: Pick<StoredMeeting, "_id" | "installationId">): Pick<UsageRecord, "meetingId" | "installationId"> {
    return {
        meetingId: meeting._id,
        ...(meeting.installationId ? { installationId: meeting.installationId } : {}),
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
    if (Object.keys(measures).length === 0) {
        return;
    }

    const events = usageEventsCollection;
    const totals = usageTotalsCollection;
    // No database (unit tests, or before initDb): nothing to record into.
    if (!events || !totals) {
        return;
    }

    const event: UsageEvent = { ...record, measures, ts: new Date() };

    try {
        await events.insertOne({ ...event });

        const scopes = [GLOBAL_USAGE_SCOPE];
        if (record.installationId) {
            scopes.push(installationUsageScope(record.installationId));
        }
        const increments: Record<string, number> = { requests: 1 };
        for (const [measure, value] of Object.entries(measures)) {
            increments[`measures.${measure}`] = value;
        }
        await Promise.all(scopes.map((scope) =>
            totals.updateOne(
                { _id: `${scope}|${record.provider}|${record.model}` },
                {
                    $inc: increments,
                    $setOnInsert: { scope, provider: record.provider, model: record.model },
                },
                { upsert: true },
            )
        ));
    } catch (error) {
        void Logger.warn("usage", `Failed to record ${record.feature} usage (${record.provider}/${record.model})`, {
            error,
            from: record.meetingId !== undefined ? { meetingId: record.meetingId } : undefined,
        });
        return;
    }

    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            void Logger.warn("usage", "Usage listener failed", { error });
        }
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
