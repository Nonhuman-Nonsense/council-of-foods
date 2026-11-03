import { CreateMeetingSchema } from "@models/ValidationSchemas.js";
import { insertMeeting } from "@services/DbService.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { randomUUID } from "node:crypto";
import { InternalServerError } from "@models/Errors.js";
import { Logger } from "@utils/Logger.js";
import { resolveVenueId } from "@utils/venues.js";
import { linkSetupUsage } from "@services/UsageService.js";
import { linkSetupGrants } from "./realtimeUsage.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import type { Character, ChildAudience } from "@shared/ModelTypes.js";

/**
 * How much slower the council speaks for each audience of children, as a factor on every voice's
 * speed. Kept on the stored characters, so the meeting's replay sounds as it did live.
 */
const CHILD_VOICE_SPEED: Record<ChildAudience, number> = { young: 0.92, older: 0.96 };

function voicesFor(characters: Character[], audience: ChildAudience | undefined): Character[] {
    if (!audience) return characters;
    const { defaultAudioSpeed } = getGlobalOptions();
    return characters.map((character) => ({
        ...character,
        voiceSpeed: Math.round((character.voiceSpeed ?? defaultAudioSpeed) * CHILD_VOICE_SPEED[audience] * 100) / 100,
    }));
}

/**
 * Create a new meeting record (DB only).
 *
 * This is the *only* creation path: HTTP `POST /api/meetings`.
 * The conversation loop starts when the client connects and emits `start_conversation` with `meetingId` and `liveKey`.
 */
export async function createMeeting(rawBody: unknown, _environment: string): Promise<{ meetingId: string, liveKey: string }> {
    const setup = CreateMeetingSchema.parse(rawBody);
    const venueId = resolveVenueId(setup.venueId);
    if (setup.venueId && !venueId) {
        await Logger.warn("createMeeting", `Unknown venue "${setup.venueId}"; meeting created without one`);
    }

    //Initial meeting record in DB
    const meeting: Omit<StoredMeeting, "_id"> = {
        topic: setup.topic,
        characters: voicesFor(setup.characters, setup.audience),
        language: setup.language,
        audio: [],
        conversation: [],
        liveKey: randomUUID(),
        date: new Date().toISOString(),
        state: {
            alreadyInvited: false,
            humanName: setup.humanName ?? null,
        },
        maximumPlayedIndex: 0,
        conversationExtraSlots: 0,
        meetingComplete: false,
        sendsLetters: setup.sendsLetters ?? false,
        printsLetters: setup.printsLetters ?? false,
        ...(venueId ? { venueId } : {}),
        ...(setup.openingAgendaPoint ? { openingAgendaPoint: setup.openingAgendaPoint } : {}),
        ...(setup.audience ? { audience: setup.audience } : {}),
    };

    const result = await insertMeeting(meeting);
    if (result.insertedId == null) {
        await Logger.error("createMeeting", "Meeting insert did not return an id");
        throw new InternalServerError();
    }
    if (setup.setupId) {
        // The setup conversation is where this meeting began: its usage, and anything its
        // agent still says, counts in the meeting's footprint.
        linkSetupGrants(setup.setupId, result.insertedId);
        void linkSetupUsage(setup.setupId, result.insertedId);
    }
    return { meetingId: result.insertedId.toString(), liveKey: meeting.liveKey };
}
