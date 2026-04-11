import { CreateMeetingSchema } from "@models/ValidationSchemas.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { insertMeeting } from "@services/DbService.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Create a new meeting record (DB only).
 *
 * This is the *only* creation path: HTTP `POST /api/meetings`.
 * The meeting loop is started later when a controller opens the meeting via WebSocket (`meeting_open`),
 * inside `MeetingSession.syncFromDbAndEnsureLoop()`.
 */
export async function createMeeting(rawBody: unknown, environment: string): Promise<{ meetingId: string, creatorKey: string }> {
    const setup = CreateMeetingSchema.parse(rawBody);

    //Initial meeting record in DB
    const meeting: Omit<StoredMeeting, "_id"> = {
        topic: setup.topic,
        characters: setup.characters,
        language: setup.language,
        audio: [],
        conversation: [],
        creatorKey: uuidv4(),
        date: new Date().toISOString(),
        state: {
            alreadyInvited: false,
            humanName: null,
        }
    };

    const result = await insertMeeting(meeting);
    if (result.insertedId == null) throw new Error("Meeting insert did not return an id");
    return { meetingId: result.insertedId.toString(), creatorKey: meeting.creatorKey };
}
