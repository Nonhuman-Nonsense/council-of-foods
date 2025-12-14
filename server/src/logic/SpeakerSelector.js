
/**
 * Logic for determining the next speaker in the conversation.
 * Handles specialized logic for human interruption, direct questions, and panelist interactions.
 */
export class SpeakerSelector {
    /**
     * Calculates the index of the next character to speak.
     * 
     * @param {Array<object>} conversation - The full conversation history.
     * @param {Array<object>} characters - List of available characters (council members + chair).
     * @returns {number} - The index of the character in the `characters` array who should speak next.
     */
    static calculateNextSpeaker(conversation, characters) {
        if (conversation.length === 0) return 0;

        for (let i = conversation.length - 1; i >= 0; i--) {
            const msg = conversation[i];

            if (msg.type === "human") {
                // Handle directed questions (e.g. "Tomato, what do you think?")
                if (msg.askParticular) {
                    // Check if this question was already answered by the next message
                    if (i + 1 < conversation.length) {
                        const nextMsg = conversation[i + 1];
                        if (nextMsg.type === 'response') {
                            // Check if responder matches the asked person
                            const askerTarget = characters.find(
                                c => c.name === msg.askParticular || c.id === msg.askParticular
                            );
                            if (askerTarget && (nextMsg.speaker === askerTarget.id || nextMsg.speaker === askerTarget.name)) {
                                continue; // Already answered
                            }
                        }
                    }

                    const index = characters.findIndex(
                        char => char.name === msg.askParticular || char.id === msg.askParticular
                    );
                    if (index !== -1) return index;
                }
                // If undirected question, skip human to find previous speaker
                continue;
            }

            if (msg.type === "invitation") continue;

            // Handle direct responses (to restore natural order after interruption)
            if (msg.type === 'response') {
                /*
                 * Logic: If a Human interrupted the flow with a Question, and FoodB responded,
                 * we want to return to who *would* have spoken next naturally.
                 * Flow: [FoodA] -> [Human Q] -> [FoodB (Response)] -> [Natural Next]
                 */
                if (i >= 2) {
                    const prevSpeakerId = conversation[i - 2].speaker;
                    const indexOfPrev = characters.findIndex(char => char.id === prevSpeakerId);

                    if (indexOfPrev !== -1) {
                        const nextNaturalIndex = indexOfPrev >= characters.length - 1 ? 0 : indexOfPrev + 1;

                        const currentResponderId = msg.speaker;
                        const currentResponderIndex = characters.findIndex(char => char.id === currentResponderId);

                        // If response was out-of-turn (i.e. not the natural next speaker),
                        // assume it was an interruption response and skip it to restore order.
                        if (currentResponderIndex !== nextNaturalIndex) {
                            continue;
                        }
                    }
                }
            }

            const lastSpeakerIndex = characters.findIndex(
                (char) => char.id === msg.speaker
            );

            // If speaker not found (e.g. 'chair'), skip
            if (lastSpeakerIndex === -1) continue;

            return lastSpeakerIndex >= characters.length - 1
                ? 0
                : lastSpeakerIndex + 1;
        }
        return 0; // Default fallback
    }
}
