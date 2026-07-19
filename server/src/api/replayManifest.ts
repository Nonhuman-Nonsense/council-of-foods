import type { Meeting, Message, MeetingIncompleteMessage } from "@shared/ModelTypes.js";
import { hasLiveSession } from "@logic/liveSessionRegistry.js";

const MEETING_INCOMPLETE_MESSAGE: MeetingIncompleteMessage = { type: "meeting_incomplete" };

function computeCapIndex(meeting: Meeting): number {
    const conv = meeting.conversation ?? [];
    const len = conv.length;
    if (len === 0) {
        return -1;
    }
    const raw = meeting.maximumPlayedIndex;
    if (raw == null) {
        return len - 1;
    }
    return Math.max(-1, Math.min(raw, len - 1));
}

function sliceConversation(meeting: Meeting): Message[] {
    const conv = [...(meeting.conversation ?? [])];
    const cap = computeCapIndex(meeting);
    if (cap < 0) {
        return [];
    }
    return conv.slice(0, cap + 1);
}

/** Pop tail while last message is a live human-wait placeholder or a dangling `invitation`.
 *
 *  IMPORTANT: this deliberately does NOT strip `summary_pending`. That marker means "the server
 *  still owes a summary here", and `buildResumeConversation` feeds directly back into the DB on
 *  resume — stripping it would drop the marker so the resumed live session never finishes the
 *  conclude. Replay (read-only) strips it separately; see `buildReplayMeetingManifest`. */
export function stripAwaitingHumanTail(messages: Message[]): void {
    while (messages.length > 0) {
        const t = messages[messages.length - 1]?.type;
        if (t === "invitation" || t === "awaiting_human_question" || t === "awaiting_human_panelist" || t === "query_extension") {
            messages.pop();
        } else {
            break;
        }
    }
}

/** Stop conversation at first message that requires audio but doesn't have it yet. */
function truncateToAvailableAudio(conversation: Message[], audioIds: string[] | undefined): Message[] {
    const allowed = new Set(audioIds ?? []);
    const result: Message[] = [];
    for (const msg of conversation) {
        // Skipped turns are silent markers; live play advances without persisted audio.
        if (msg.id && msg.type !== "skipped" && !allowed.has(msg.id)) {
            break;
        }
        result.push(msg);
    }
    return result;
}

/**
 * Audio ids in **conversation order**, only for messages that appear in `conversation`
 * and whose `id` is listed on the stored meeting's `audio` array.
 */
export function orderedAudioIdsForConversation(
    conversation: Message[],
    storedAudioIds: string[] | undefined
): string[] {
    const allowed = new Set(storedAudioIds ?? []);
    const out: string[] = [];
    for (const msg of conversation) {
        const id = msg.id;
        if (id && allowed.has(id)) {
            out.push(id);
        }
    }
    return out;
}

/**
 * Sanitized conversation shared by replay (GET) and resume (PUT):
 *  does not only view up to the maximumPlayedIndex, but starts with the whole conversation
 *
 * Does **not** append the synthetic `meeting_incomplete` message (that is replay-only).
 */
export function buildResumeConversation(meeting: Meeting): Message[] {
    // Start with the whole conversation
    let conversation = meeting.conversation;
    // Then truncate to the available audio
    conversation = truncateToAvailableAudio(conversation, meeting.audio);
    // Then strip the awaiting human and invitation tails
    stripAwaitingHumanTail(conversation);
    return conversation;
}

/**
 * Build the public replay manifest from a meeting (complete or in-progress).
 */
export function buildReplayMeetingManifest(meeting: Meeting): Meeting {
    let conversation = sliceConversation(meeting);

    // Ensure we only include messages that actually have audio available.
    // This prevents the replay client from getting stuck if a live session 
    // is currently generating audio for late-arriving messages.
    conversation = truncateToAvailableAudio(conversation, meeting.audio);

    stripAwaitingHumanTail(conversation);

    // Replay is read-only: a not-yet-generated summary can never be produced here, so drop a
    // trailing summary_pending marker and let it fall through to `meeting_incomplete` below —
    // rather than handing the client a summary placeholder that would sit in Loading forever.
    // (Resume deliberately keeps the marker; see stripAwaitingHumanTail's note.)
    while (conversation.length > 0 && conversation[conversation.length - 1]?.type === "summary_pending") {
        conversation.pop();
    }

    // No playable content yet — either the meeting was just created, or the only messages so
    // far are still waiting on audio generation (see truncateToAvailableAudio above). Fall
    // through to the same `meeting_incomplete` handling as any other in-progress replay rather
    // than erroring: the client already offers to resume from that state (see meetingRoutes.ts,
    // which logs a warning when this happens so it stays visible).
    const lastMessageObj = conversation.length > 0 ? conversation[conversation.length - 1] : null;
    const hasSummary = lastMessageObj?.type === "summary";

    if (!hasSummary) {
        const marker: Message = hasLiveSession(meeting._id)
            ? { ...MEETING_INCOMPLETE_MESSAGE, elsewhere: true }
            : { ...MEETING_INCOMPLETE_MESSAGE };
        conversation = [...conversation, marker];
    }

    const conversationForAudio = hasSummary ? conversation : conversation.slice(0, -1);
    const audio = orderedAudioIdsForConversation(conversationForAudio, meeting.audio);

    return { ...meeting, conversation, audio };
}

/**
 * True when the replay manifest ends with a summary message whose audio is listed.
 * Used at conclude promotion and in migration backfill — not for replay GET.
 */
export function isCompleteReplayManifest(meeting: Meeting): boolean {
    let manifest: Meeting;
    try {
        manifest = buildReplayMeetingManifest(meeting);
    } catch {
        return false;
    }

    const last = manifest.conversation.at(-1);
    if (last?.type !== "summary") {
        return false;
    }

    const summaryId = last.id;
    if (!summaryId) {
        return false;
    }

    return (manifest.audio ?? []).includes(summaryId);
}
