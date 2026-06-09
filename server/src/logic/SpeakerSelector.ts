import type { Character, Message } from '@shared/ModelTypes.js';

export interface SpeakerSelectorOptions {
    directedSpeakerRouting?: boolean;
    chairId?: string;
}

const NON_SPEAKER_MESSAGE_TYPES = new Set([
    "invitation",
    "awaiting_human_question",
    "awaiting_human_panelist",
    "max_reached",
    "meeting_incomplete",
    "summary",
]);

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
    static calculateNextSpeaker(
        conversation: Message[],
        characters: Character[],
        options: SpeakerSelectorOptions = {}
    ): number {
        if (conversation.length === 0) return 0;

        if (options.directedSpeakerRouting && options.chairId) {
            const chairIndex = characters.findIndex((character) => character.id === options.chairId);
            if (chairIndex !== -1 && shouldForceChair(conversation, characters, options.chairId)) {
                return chairIndex;
            }

            const latest = conversation[conversation.length - 1];
            const latestHasDirectedTarget = "askParticular" in latest && Boolean(latest.askParticular);
            if (!latestHasDirectedTarget) {
                const openFloorIndex = pickLeastSpokenWithRoundRobinTiebreak(
                    conversation,
                    characters,
                    options.chairId
                );
                if (openFloorIndex !== -1) {
                    return openFloorIndex;
                }
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

function findLastSpeakerIndex(conversation: Message[], characters: Character[]): number {
    for (let i = conversation.length - 1; i >= 0; i--) {
        const message = conversation[i];
        if (!("speaker" in message) || NON_SPEAKER_MESSAGE_TYPES.has(message.type)) continue;
        const index = characters.findIndex((character) => character.id === message.speaker);
        if (index !== -1) {
            return index;
        }
    }
    return -1;
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

    if (tiedIndices.length === 1) {
        return tiedIndices[0];
    }

    const tiedSet = new Set(tiedIndices);
    const lastSpeakerIndex = findLastSpeakerIndex(conversation, characters);
    const startIndex = lastSpeakerIndex === -1 ? 0 : lastSpeakerIndex;

    for (let offset = 1; offset <= characters.length; offset++) {
        const candidateIndex = (startIndex + offset) % characters.length;
        if (tiedSet.has(candidateIndex)) {
            return candidateIndex;
        }
    }

    return tiedIndices[0];
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
