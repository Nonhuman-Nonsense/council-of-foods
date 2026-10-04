import type { Message } from "./ModelTypes.js";

/**
 * Every message type that means the meeting has begun to end — the closing line has been said
 * and the summary (a protocol or a letter) is owed or done. From the first of them on the
 * meeting only finishes: no raised hand, no new turn, no stale pause may divert it.
 */
const CONCLUDING_TYPES: ReadonlySet<Message["type"]> = new Set([
    "letter_pending",
    "awaiting_letter_addition",
    "summary_pending",
    "summary",
]);

export function isConcluding(conversation: readonly Message[]): boolean {
    return conversation.some((message) => CONCLUDING_TYPES.has(message.type));
}
