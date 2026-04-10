import { SetupOptionsSchema } from "@models/ValidationSchemas.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { insertMeeting } from "@services/DbService.js";
import type { SetupOptions } from "@shared/SocketTypes.js";
import type { ConversationOptions, Meeting } from "@models/DBModels.js";

/**
 * Create a new meeting record (DB only).
 *
 * This is the *only* creation path: HTTP `POST /api/meetings`.
 * The meeting loop is started later when a controller opens the meeting via WebSocket (`meeting_open`),
 * inside `MeetingSession.syncFromDbAndEnsureLoop()`.
 */
export async function createMeetingRecord(rawBody: unknown, environment: string): Promise<number> {
    const setup = SetupOptionsSchema.parse(rawBody) as SetupOptions;

    const baseOptions = getGlobalOptions();
    const resolvedOptions = environment === "prototype"
        ? ({ ...baseOptions, ...(setup.options || {}) })
        : baseOptions;

    const conversationOptions: ConversationOptions = {
        topic: setup.topic,
        characters: setup.characters,
        language: setup.language,
        options: resolvedOptions,
        state: { alreadyInvited: false },
    };

    const meeting: Omit<Meeting, "_id"> = {
        options: conversationOptions,
        audio: [],
        conversation: [],
        date: new Date().toISOString(),
    };

    const result = await insertMeeting(meeting);
    if (result.insertedId == null) throw new Error("Meeting insert did not return an id");
    return result.insertedId;
}
