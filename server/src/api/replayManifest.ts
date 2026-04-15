import type { Meeting, Message } from "@shared/ModelTypes.js";

const MEETING_INCOMPLETE_MESSAGE: Message = { type: "meeting_incomplete" };

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

/** Pop tail while last message is a live human-wait placeholder (replay only). */
export function stripAwaitingHumanTail(messages: Message[]): void {
    while (messages.length > 0) {
        const t = messages[messages.length - 1]?.type;
        if (t === "invitation" || t === "awaiting_human_question" || t === "awaiting_human_panelist") {
            messages.pop();
        } else {
            break;
        }
    }
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
 * Build the public replay manifest from a meeting
 */
export function buildReplayMeetingManifest(meeting: Meeting): Meeting {
    let conversation = sliceConversation(meeting);
    stripAwaitingHumanTail(conversation);

    const hasSummary = meeting.summary != null;
    if (!hasSummary) {
        conversation = [...conversation, { ...MEETING_INCOMPLETE_MESSAGE }];
    }

    const conversationForAudio = hasSummary ? conversation : conversation.slice(0, -1);
    const audio = orderedAudioIdsForConversation(conversationForAudio, meeting.audio);

    return { ...meeting, conversation, audio, summary: meeting.summary };
}
