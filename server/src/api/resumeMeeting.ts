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
export async function resumeMeeting(rawBody: unknown, _environment: string): Promise<{ meetingId: string, creatorKey: string }> {

    //TODO: Check that no one else is currently doing a live meeting

    // const result = await insertMeeting(meeting);
    // if (result.insertedId == null) throw new InternalServerError("Meeting insert did not return an id");
    // return { meetingId: result.insertedId.toString(), creatorKey: meeting.creatorKey };
}
