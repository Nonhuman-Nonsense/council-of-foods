import { meetingsCollection } from "@services/DbService.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { getMeeting } from "./getMeeting.js";
import { isCompleteReplayManifest } from "./replayManifest.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";
import type { StoredMeeting } from "@models/DBModels.js";

const MAX_SAMPLE_ATTEMPTS = 8;

function buildAutoplayMatchFilter(language?: string): Record<string, unknown> {
    const { autoplayEarliestMeetingDate } = getGlobalOptions();
    const filter: Record<string, unknown> = {
        summary: { $exists: true, $ne: null },
        date: { $gte: autoplayEarliestMeetingDate },
        audio: { $exists: true, $not: { $size: 0 } },
    };
    if (language) {
        filter.language = language;
    }
    return filter;
}

/**
 * Pick a random completed meeting suitable for kiosk autoplay replay.
 */
export async function getAutoplayMeeting(language?: string): Promise<{ meetingId: number }> {
    const filter = buildAutoplayMatchFilter(language);

    for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
        const sampled = await meetingsCollection
            .aggregate<StoredMeeting>([{ $match: filter }, { $sample: { size: 1 } }])
            .toArray();

        const candidate = sampled[0];
        if (!candidate) {
            break;
        }

        try {
            const meeting = await getMeeting(candidate._id);
            if (!isCompleteReplayManifest(meeting)) {
                continue;
            }
            return { meetingId: candidate._id };
        } catch {
            // Sample again when manifest rules reject this record.
        }
    }

    throw new NotFoundError();
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
