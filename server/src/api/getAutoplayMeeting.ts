import { meetingsCollection } from "@services/DbService.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";
import type { StoredMeeting } from "@models/DBModels.js";

/**
 * Pick a random completed meeting suitable for kiosk autoplay replay.
 */
export async function getAutoplayMeeting(language?: string): Promise<{ meetingId: number }> {
    const { autoplayEarliestMeetingDate } = getGlobalOptions();
    const filter: Record<string, unknown> = {
        meetingComplete: true,
        date: { $gte: autoplayEarliestMeetingDate },
        audio: { $exists: true, $not: { $size: 0 } },
    };
    if (language) {
        filter.language = language;
    }

    const sampled = await meetingsCollection
        .aggregate<StoredMeeting>([{ $match: filter }, { $sample: { size: 1 } }])
        .toArray();

    const candidate = sampled[0];
    if (!candidate) {
        throw new NotFoundError();
    }

    return { meetingId: candidate._id };
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
