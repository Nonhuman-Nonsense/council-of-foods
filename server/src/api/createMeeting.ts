import { CreateMeetingSchema } from "@models/ValidationSchemas.js";
import { insertMeeting } from "@services/DbService.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { v4 as uuidv4 } from "uuid";
import { InternalServerError } from "@models/Errors.js";

/**
 * Create a new meeting record (DB only).
 *
 * This is the *only* creation path: HTTP `POST /api/meetings`.
 * The conversation loop starts when the client connects and emits `start_conversation` with `meetingId` and `creatorKey`.
 */
export async function createMeeting(rawBody: unknown, _environment: string): Promise<{ meetingId: string, creatorKey: string }> {
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
        },
        maximumPlayedIndex: 0,
    };

    const result = await insertMeeting(meeting);
    if (result.insertedId == null) throw new InternalServerError("Meeting insert did not return an id");
    return { meetingId: result.insertedId.toString(), creatorKey: meeting.creatorKey };
}
