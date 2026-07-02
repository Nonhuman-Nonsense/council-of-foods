import { meetingsCollection } from "@services/DbService.js";
import { getMeeting } from "./getMeeting.js";
import { isCompleteReplayManifest } from "./replayManifest.js";
import { buildAutoplaySamplePipeline } from "./autoplayMeetingQuery.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";
import type { StoredMeeting } from "@models/DBModels.js";

/**
 * Pick a random completed meeting suitable for kiosk autoplay replay.
 *
 * Selection uses a single aggregation `$match` + `$sample` (see autoplayMeetingQuery).
 * `isCompleteReplayManifest` is the final gate for edge cases Mongo cannot express
 * (e.g. missing audio on an earlier message). Long term: `meetingComplete` flag —
 * docs/meeting-complete-flag-plan.md.
 */
export async function getAutoplayMeeting(language?: string): Promise<{ meetingId: number }> {
    const pipeline = buildAutoplaySamplePipeline(language);
    const sampled = await meetingsCollection
        .aggregate<StoredMeeting>(pipeline)
        .toArray();

    const candidate = sampled[0];
    if (!candidate) {
        throw new NotFoundError();
    }

    try {
        const meeting = await getMeeting(candidate._id);
        if (!isCompleteReplayManifest(meeting)) {
            throw new NotFoundError();
        }
        return { meetingId: candidate._id };
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw error;
        }
        throw new NotFoundError();
    }
}

export function parseAutoplayLanguageQuery(value: unknown): string | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    if (typeof value !== "string" || !/^[a-z]{2}$/i.test(value)) {
        throw new BadRequestError();
    }
    return value.toLowerCase();
}
