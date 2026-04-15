import type { StoredMeeting } from "@models/DBModels.js";
import { meetingsCollection } from "@services/DbService.js";
import type { Meeting } from "@shared/ModelTypes.js";
import { ForbiddenError, NotFoundError } from "@models/Errors.js";

export async function getMeetingById(meetingId: number): Promise<StoredMeeting> {
    const storedMeeting = await meetingsCollection.findOne({ _id: meetingId }) as StoredMeeting | null;
    if (!storedMeeting) {
        throw new NotFoundError();
    }
    return storedMeeting;
}

/**
 * Get a meeting record from the database (creator API — full document as stored).
 */
export async function getMeeting(meetingId: number, bearer?: string): Promise<Meeting> {
    const storedMeeting = await getMeetingById(meetingId);
    
    if(bearer && bearer !== storedMeeting.creatorKey) {
        throw new ForbiddenError();
    }
    //Always unset the creator key for GET requests
    const { creatorKey, ...meeting } = storedMeeting;

    return meeting;
}
