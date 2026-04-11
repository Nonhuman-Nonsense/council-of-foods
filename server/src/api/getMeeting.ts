import type { StoredMeeting } from "@models/DBModels.js";
import { meetingsCollection } from "@services/DbService.js";
import type { Meeting } from "@shared/ModelTypes.js";
import { Logger } from "@utils/Logger.js";

/**
 * Get a meeting record from the database.
 */
export async function getMeeting(meetingId: number): Promise<Meeting> {
    try {
        const storedMeeting = await meetingsCollection.findOne({ _id: meetingId }) as StoredMeeting | null;

        if (!storedMeeting) throw new Error("Meeting not found");

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
        };

        return meeting;
    } catch (error) {
        await Logger.error("getMeeting", "Error getting meeting", error);
        throw error;
    }
}
