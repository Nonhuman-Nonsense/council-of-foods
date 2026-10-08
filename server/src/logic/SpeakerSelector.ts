import type { Character, Message } from '@shared/ModelTypes.js';

export interface SpeakerSelectorOptions {
    directedSpeakerRouting?: boolean;
    chairId?: string;
}

const NON_SPEAKER_MESSAGE_TYPES = new Set([
    "invitation",
    "awaiting_human_question",
    "awaiting_human_panelist",
    "query_extension",
    "meeting_incomplete",
    "summary",
]);

/** A participant's turn in the debate: spoken, or skipped (failed generation, or a human who passed). */
const TURN_TYPES = new Set(["message", "response", "panelist", "skipped"]);

/** Human panelists are the characters the visitor adds by name (`panelist0`, …). */
function isPanelistId(id: string | undefined): boolean {
    return typeof id === "string" && id.startsWith("panelist");
}

/**
 * Logic for determining the next speaker in the conversation.
 * Handles specialized logic for human interruption, direct questions, and panelist interactions.
 */
export class SpeakerSelector {
    /**
     * Calculates the index of the next character to speak.
     *
     * @param conversation - The full conversation history.
     * @param characters - List of available characters (council members + chair).
     * @param options - Optional routing settings (directed routing, chair id).
     * @returns The index of the character in the `characters` array who should speak next.
     */
    /**
     * Whether a human has spoken and fewer than two beings have replied since.
     * The chair's cadence waits for those replies, and so does a soft cap, so a
     * human is never the last voice before the meeting ends or pauses to extend.
     */
    static awaitsRepliesToHuman(conversation: Message[], characters: Character[], chairId: string): boolean {
        return awaitsRepliesToHuman(conversation, characters, chairId);
    }

    static calculateNextSpeaker(
        conversation: Message[],
        characters: Character[],
        options: SpeakerSelectorOptions = {}
    ): number {
        if (conversation.length === 0) return 0;

        if (options.directedSpeakerRouting && options.chairId) {
            const directed = pickDirected(conversation, characters, options.chairId);
            if (directed !== -1) return directed;

            const openFloorIndex = pickLeastSpokenWithRoundRobinTiebreak(
                conversation,
                characters,
                options.chairId
            );
            if (openFloorIndex !== -1) {
                return openFloorIndex;
            }
        }

        for (let i = conversation.length - 1; i >= 0; i--) {
            const msg = conversation[i];

            if ("askParticular" in msg && msg.askParticular) {
                if (i + 1 < conversation.length) {
                    const nextMsg = conversation[i + 1];
                    if ("speaker" in nextMsg) {
                        const askerTarget = characters.find(
                            (character) =>
                                character.name === msg.askParticular || character.id === msg.askParticular
                        );
                        if (askerTarget && nextMsg.speaker === askerTarget.id) {
                            continue;
                        }
                    }
                }

                const index = characters.findIndex(
                    (character) =>
                        character.name === msg.askParticular || character.id === msg.askParticular
                );
                if (index !== -1) {
                    return index;
                }
            }

            if (msg.type === "human") {
                continue;
            }

            if (msg.type === "invitation") continue;

            if (msg.type === 'response') {
                /*
                 * Logic: If a Human interrupted the flow with a Question, and FoodB responded,
                 * we want to return to who *would* have spoken next naturally.
                 * Flow: [FoodA] -> [Human Q] -> [FoodB (Response)] -> [Natural Next]
                 */
                if (i >= 2) {
                    const prevSpeakerId = conversation[i - 2].speaker;
                    const indexOfPrev = characters.findIndex((character) => character.id === prevSpeakerId);

                    if (indexOfPrev !== -1) {
                        const nextNaturalIndex = indexOfPrev >= characters.length - 1 ? 0 : indexOfPrev + 1;

                        const currentResponderId = msg.speaker;
                        const currentResponderIndex = characters.findIndex(
                            (character) => character.id === currentResponderId
                        );

                        if (currentResponderIndex !== nextNaturalIndex) {
                            continue;
                        }
                    }
                }
            }

            const lastSpeakerIndex = characters.findIndex(
                (character) => character.id === msg.speaker
            );

            if (lastSpeakerIndex === -1) continue;

            const nextIndex = lastSpeakerIndex >= characters.length - 1 ? 0 : lastSpeakerIndex + 1;
            return nextIndex;
        }

        return 0;
    }
}

function countCharacterMessages(conversation: Message[], characters: Character[]): Map<string, number> {
    const counts = new Map(characters.map((character) => [character.id, 0]));

    for (const message of conversation) {
        if (!("speaker" in message) || NON_SPEAKER_MESSAGE_TYPES.has(message.type)) continue;
        const speakerId = message.speaker;
        if (!speakerId || !counts.has(speakerId)) continue;
        counts.set(speakerId, (counts.get(speakerId) ?? 0) + 1);
    }

    return counts;
}

function pickLeastSpokenWithRoundRobinTiebreak(
    conversation: Message[],
    characters: Character[],
    chairId: string
): number {
    const counts = countCharacterMessages(conversation, characters);

    let minCount = Infinity;
    for (const character of characters) {
        if (character.id === chairId) continue;
        minCount = Math.min(minCount, counts.get(character.id) ?? 0);
    }

    if (!Number.isFinite(minCount)) {
        return -1;
    }

    const tiedIndices: number[] = [];
    for (let i = 0; i < characters.length; i++) {
        const character = characters[i];
        if (character.id === chairId) continue;
        if ((counts.get(character.id) ?? 0) === minCount) {
            tiedIndices.push(i);
        }
    }

    if (tiedIndices.length === 0) {
        return -1;
    }

    // Among equally quiet participants, prefer whoever comes first in the initial lineup order.
    return tiedIndices[0];
}

/**
 * Directed routing, in priority order:
 *
 * 1. Direct question: whoever the latest message asked answers it. Except when
 *    that message was itself an answer to a direct question: then a due cadence
 *    (2 or 3) takes the floor first, so participants asking each other back and
 *    forth cannot keep the human or the chair out.
 * 2. Human cadence: a human panelist who has not spoken yet is due once as many
 *    turns have passed as there are participants ahead of them in the lineup —
 *    the place the lineup gives them, guaranteed.
 * 3. Chair cadence: the chair is due once everyone else has had a turn since it
 *    last spoke, but waits until two beings have replied to a human.
 * 4. Open floor (-1 here): the caller picks the least-spoken participant.
 *
 * Several human panelists are supported (older meetings have them, even though
 * the client currently allows one): they come due in lineup order.
 */
function pickDirected(conversation: Message[], characters: Character[], chairId: string): number {
    const latest = conversation[conversation.length - 1];
    const askedIndex = "askParticular" in latest && latest.askParticular
        ? findCharacterIndex(characters, latest.askParticular)
        : -1;
    if (askedIndex !== -1 && latest.type !== "response") return askedIndex;

    const humanIndex = pickDueHuman(conversation, characters, chairId);
    if (humanIndex !== -1) return humanIndex;

    const chairIndex = characters.findIndex((character) => character.id === chairId);
    if (
        chairIndex !== -1 &&
        shouldForceChair(conversation, characters, chairId) &&
        !awaitsRepliesToHuman(conversation, characters, chairId)
    ) {
        return chairIndex;
    }

    return askedIndex;
}

function pickDueHuman(conversation: Message[], characters: Character[], chairId: string): number {
    const turns = conversation.filter(
        (msg) => isTurn(msg) && msg.speaker !== chairId && characters.some((c) => c.id === msg.speaker)
    ).length;

    let ahead = 0;
    for (let i = 0; i < characters.length; i++) {
        const { id } = characters[i];
        if (id === chairId) continue;
        if (isPanelistId(id) && turns >= ahead && !conversation.some((msg) => isTurn(msg) && msg.speaker === id)) {
            return i;
        }
        ahead++;
    }
    return -1;
}

/**
 * After a human speaks, the chair (and a soft cap) waits until two beings have
 * replied. A human answering a question put to them while that wait is still
 * running continues the same exchange instead of restarting it, so a human and
 * a being asking each other back and forth cannot hold the chair off.
 */
function awaitsRepliesToHuman(conversation: Message[], characters: Character[], chairId: string): boolean {
    let start = findPreviousHumanSpeech(conversation, conversation.length, chairId);
    if (start === -1) return false;

    while (answersDirectQuestion(conversation, start, characters)) {
        const earlier = findPreviousHumanSpeech(conversation, start, chairId);
        if (earlier === -1 || countBeingReplies(conversation, earlier, start, characters, chairId) > 2) break;
        start = earlier;
    }

    return countBeingReplies(conversation, start, conversation.length, characters, chairId) < 2;
}

/** The latest human message before `before`, or -1 if the chair has spoken since (or nobody has). */
function findPreviousHumanSpeech(conversation: Message[], before: number, chairId: string): number {
    for (let i = before - 1; i >= 0; i--) {
        const msg = conversation[i];
        if (isTurn(msg) && msg.speaker === chairId) return -1;
        if (msg.type === "human" || (msg.type === "panelist" && isPanelistId(msg.speaker))) return i;
    }
    return -1;
}

function answersDirectQuestion(conversation: Message[], index: number, characters: Character[]): boolean {
    const previous = conversation[index - 1];
    if (!previous || !("askParticular" in previous) || !previous.askParticular) return false;
    const asked = findCharacterIndex(characters, previous.askParticular);
    return asked !== -1 && characters[asked].id === conversation[index].speaker;
}

/** Beings' (not the chair's, not humans') spoken messages strictly between `from` and `to`. */
function countBeingReplies(
    conversation: Message[],
    from: number,
    to: number,
    characters: Character[],
    chairId: string
): number {
    let count = 0;
    for (let i = from + 1; i < to; i++) {
        const msg = conversation[i];
        if (msg.type !== "message" && msg.type !== "response") continue;
        if (msg.speaker === chairId || isPanelistId(msg.speaker)) continue;
        if (characters.some((character) => character.id === msg.speaker)) count++;
    }
    return count;
}

function isTurn(msg: Message): boolean {
    return TURN_TYPES.has(msg.type) && "speaker" in msg;
}

function findCharacterIndex(characters: Character[], nameOrId: string): number {
    return characters.findIndex((character) => character.name === nameOrId || character.id === nameOrId);
}

function shouldForceChair(conversation: Message[], characters: Character[], chairId: string): boolean {
    let turnsSinceChair = 0;

    for (let i = conversation.length - 1; i >= 0; i--) {
        const msg = conversation[i];
        if (!("speaker" in msg) || NON_SPEAKER_MESSAGE_TYPES.has(msg.type)) continue;

        if (msg.speaker === chairId) {
            return turnsSinceChair >= characters.length - 1;
        }

        turnsSinceChair++;
    }

    return false;
}
