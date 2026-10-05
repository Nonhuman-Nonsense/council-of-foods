import { meetingsCollection } from "@services/DbService.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { Logger } from "@utils/Logger.js";

/**
 * Pick a random completed meeting suitable for kiosk autoplay replay. An installation passes its
 * venue to replay the meetings held there; a venue with none yet falls back to every venue's.
 */
export async function getAutoplayMeeting(language?: string, venueId?: string): Promise<{ meetingId: number }> {
    const { autoplayEarliestMeetingDate } = getGlobalOptions();
    const filter: Record<string, unknown> = {
        meetingComplete: true,
        date: { $gte: autoplayEarliestMeetingDate },
        audio: { $exists: true, $not: { $size: 0 } },
    };
    if (language) {
        filter.language = language;
    }

    let candidate = venueId ? await sampleMeeting({ ...filter, venueId }) : undefined;
    if (venueId && !candidate) {
        await Logger.info("autoplay", `No meetings to replay at venue ${venueId}; picking from every venue`);
    }
    candidate ??= await sampleMeeting(filter);
    if (!candidate) {
        throw new NotFoundError();
    }

    return { meetingId: candidate._id };
}

async function sampleMeeting(filter: Record<string, unknown>): Promise<StoredMeeting | undefined> {
    const sampled = await meetingsCollection
        .aggregate<StoredMeeting>([{ $match: filter }, { $sample: { size: 1 } }])
        .toArray();
    return sampled[0];
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
