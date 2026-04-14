import type { StoredMeeting } from "@models/DBModels.js";
import { meetingsCollection } from "@services/DbService.js";
import type { Meeting } from "@shared/ModelTypes.js";
import { Logger } from "@utils/Logger.js";

/** Thrown when no document exists for the requested meeting id (maps to HTTP 404). */
export class MeetingNotFoundError extends Error {
    override readonly name = "MeetingNotFoundError";
    constructor() {
        super("Meeting not found");
    }
}

export async function getStoredMeetingById(meetingId: number): Promise<StoredMeeting> {
    const storedMeeting = await meetingsCollection.findOne({ _id: meetingId }) as StoredMeeting | null;
    if (!storedMeeting) {
        throw new MeetingNotFoundError();
    }
    return storedMeeting;
}

/**
 * Get a meeting record from the database (creator API — full document as stored).
 */
export async function getMeeting(meetingId: number): Promise<Meeting> {
    try {
        const storedMeeting = await getStoredMeetingById(meetingId);

        const meeting: Meeting = {
            _id: storedMeeting._id,
            creatorKey: storedMeeting.creatorKey,
            date: storedMeeting.date,
            topic: storedMeeting.topic,
            characters: storedMeeting.characters,
            language: storedMeeting.language,
            state: storedMeeting.state,
            conversation: storedMeeting.conversation,
            audio: storedMeeting.audio,
            summary: storedMeeting.summary,
            maximumPlayedIndex: storedMeeting.maximumPlayedIndex,
        };

        return meeting;
    } catch (error) {
        if (error instanceof MeetingNotFoundError) {
            throw error;
        }
        await Logger.error("getMeeting", "Error getting meeting", error);
        throw error;
    }
}
