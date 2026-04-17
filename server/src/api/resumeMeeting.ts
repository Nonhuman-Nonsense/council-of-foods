import type { ResumeMeetingResponse } from "@shared/SocketTypes.js";
import { meetingsCollection } from "@services/DbService.js";
import { BadRequestError, ConflictError } from "@models/Errors.js";
import { hasLiveSession } from "@logic/liveSessionRegistry.js";
import { getMeeting } from "./getMeeting.js";
import { buildResumeConversation, orderedAudioIdsForConversation } from "./replayManifest.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Re-open a half-finished meeting (no `summary` yet) for a new creator.
 *
 * Public endpoint (anyone with the id may try) but gated by the in-memory live-session
 * registry — refuses if a live session currently holds the meeting. On success it rotates
 * the `creatorKey`, sanitizes the stored conversation with the same rules as the replay
 * manifest (slice by `maximumPlayedIndex` → truncate to available audio → strip
 * awaiting-human / invitation tail), trims the `audio` array to the ids that survive, and
 * returns the full updated meeting so the caller can reconcile any messages that landed
 * between its replay `GET` and this `PUT`.
 */
export async function resumeMeeting(meetingId: number): Promise<ResumeMeetingResponse> {
    const stored = await getMeeting(meetingId);

    if (stored.summary != null) {
        throw new BadRequestError("MeetingAlreadyComplete");
    }

    if (hasLiveSession(meetingId)) {
        throw new ConflictError("This meeting is happening somewhere else");
    }

    // Let start with seeing how far of a conversation that we already have
    // It might be that quite a lot of messages are already completed, but they were never displayed to the user
    // In this case, we can use these messages already, even surpassing the maximumPlayedIndex, and the user will see them immediately
    // but we allow the user to raise hand, and possible remove them later etc.
    const conversation = buildResumeConversation(stored);

    // Make sure that audio is in the same order as the conversation
    const trimmedAudio = orderedAudioIdsForConversation(conversation, stored.audio);    
    
    const newCreatorKey = uuidv4();

    // Optimistic filter: if a `summary` has since been written (race with wrap-up), abort.
    const updateResult = await meetingsCollection.updateOne(
        { _id: meetingId, summary: { $exists: false } },
        {
            $set: {
                creatorKey: newCreatorKey,
                conversation,
                audio: trimmedAudio,
                state: { alreadyInvited: false },
            },
        }
    );
    if (updateResult.matchedCount !== 1) {
        throw new BadRequestError("MeetingAlreadyComplete");
    }

    // Fetch through the creator-GET path so `creatorKey` is stripped and the shape is consistent.
    const meeting = await getMeeting(meetingId, newCreatorKey);
    return { meeting, creatorKey: newCreatorKey };
}
