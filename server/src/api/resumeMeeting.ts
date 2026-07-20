import type { ResumeMeetingResponse } from "@shared/SocketTypes.js";
import { meetingsCollection } from "@services/DbService.js";
import { BadRequestError, ConflictError } from "@models/Errors.js";
import { hasLiveSession } from "@logic/liveSessionRegistry.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { Logger } from "@utils/Logger.js";
import { getMeeting } from "./getMeeting.js";
import { buildResumeConversation, orderedAudioIdsForConversation } from "./replayManifest.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Re-open a half-finished meeting for a new creator.
 *
 * Public endpoint (anyone with the id may try) but gated by the in-memory live-session
 * registry — refuses if a live session currently holds the meeting. On success it rotates
 * the `liveKey`, sanitizes the stored conversation with the same rules as the replay
 * manifest (slice by `maximumPlayedIndex` → truncate to available audio → strip
 * awaiting-human / invitation tail), trims the `audio` array to the ids that survive, and
 * returns the full updated meeting so the caller can reconcile any messages that landed
 * between its replay `GET` and this `PUT`.
 *
 * Also resolves a pending `query_extension`: `buildResumeConversation` strips a trailing
 * sentinel like any other awaiting-human tail, but doing that alone would leave
 * `conversationExtraSlots` unchanged, so the resumed live loop would immediately re-hit the
 * same length cap and re-prompt the very user who just asked to continue. Only when the
 * *raw* stored tail (before stripping) was `query_extension` do we grant the extension here
 * directly — a meeting resumed well below its cap must still prompt normally whenever it
 * eventually gets there, since the client never saw a sentinel to duplicate in that case. If
 * there's no room left under `meetingVeryMaxLength`, we deliberately leave the slots
 * untouched: the resumed loop's own cap check (`MeetingManager.decideNextAction`) then finds
 * the conversation still at/over the very-max length and auto-concludes on its own, exactly
 * as it would for any other meeting that hits that ceiling.
 */
export async function resumeMeeting(meetingId: number): Promise<ResumeMeetingResponse> {
    const stored = await getMeeting(meetingId);

    if (stored.meetingComplete) {
        throw new BadRequestError("Meeting already complete");
    }

    if (hasLiveSession(meetingId)) {
        throw new ConflictError();
    }

    // Let start with seeing how far of a conversation that we already have
    // It might be that quite a lot of messages are already completed, but they were never displayed to the user
    // In this case, we can use these messages already, even surpassing the maximumPlayedIndex, and the user will see them immediately
    // but we allow the user to raise hand, and possible remove them later etc.
    const conversation = buildResumeConversation(stored);

    // Make sure that audio is in the same order as the conversation
    const trimmedAudio = orderedAudioIdsForConversation(conversation, stored.audio);

    let conversationExtraSlots = stored.conversationExtraSlots ?? 0;
    const wasAwaitingExtension = stored.conversation[stored.conversation.length - 1]?.type === "query_extension";
    if (wasAwaitingExtension) {
        const { conversationMaxLength, extraMessageCount, meetingVeryMaxLength } = getGlobalOptions();
        const currentCap = conversationMaxLength + conversationExtraSlots;
        if (currentCap < meetingVeryMaxLength) {
            conversationExtraSlots += extraMessageCount;
            await Logger.info(
                "api",
                `resume auto-extending meeting ${meetingId}: conversationExtraSlots ${stored.conversationExtraSlots ?? 0} -> ${conversationExtraSlots}`,
                { from: { meetingId } },
            );
        } else {
            await Logger.info(
                "api",
                `resume found meeting ${meetingId} awaiting extension but at meetingVeryMaxLength; leaving slots as-is (will auto-conclude)`,
                { from: { meetingId } },
            );
        }
    }

    const newliveKey = uuidv4();

    // Optimistic filter: if conclude finished since replay GET (race), abort.
    const updateResult = await meetingsCollection.updateOne(
        { _id: meetingId, meetingComplete: { $ne: true } },
        {
            $set: {
                liveKey: newliveKey,
                conversation,
                audio: trimmedAudio,
                state: { alreadyInvited: false },
                conversationExtraSlots,
            },
        }
    );
    if (updateResult.matchedCount !== 1) {
        throw new BadRequestError();
    }

    // Fetch through the creator-GET path so `liveKey` is stripped and the shape is consistent.
    const meeting = await getMeeting(meetingId, newliveKey);
    return { meeting, liveKey: newliveKey };
}
