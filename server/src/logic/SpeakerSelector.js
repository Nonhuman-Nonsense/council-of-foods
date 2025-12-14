
export class SpeakerSelector {
    static calculateNextSpeaker(conversation, characters) {
        if (conversation.length === 0) return 0;

        for (let i = conversation.length - 1; i >= 0; i--) {
            const msg = conversation[i];

            //If last message was human input
            if (msg.type === "human") {
                //And it contained a question to a particular food
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
                                // Already answered, so this question shouldn't trigger a new turn
                                continue;
                            }
                        }
                    }

                    // Try matching by Name or ID for robustness
                    const index = characters.findIndex(
                        char => char.name === msg.askParticular || char.id === msg.askParticular
                    );
                    if (index !== -1) return index;
                }
                //If just a human question to anyone in the council, skip it and look at previous speaker
                continue;
            }
            //Skip invitations
            if (msg.type === "invitation") continue;

            // Skip direct responses to questions when calculating next speaker
            if (msg.type === 'response') {
                // Determine who *would* have spoken if they hadn't been interrupted.
                // We need to look back before the Human Question to find the "previous" natural speaker.
                // Flow: [FoodA] -> [Human Q] -> [FoodB (Response)] -> [Calculated Next]
                // i = FoodB Response
                // i-1 = Human Q
                // i-2 = FoodA

                // Safe check bounds
                if (i >= 2) {
                    const prevSpeakerId = conversation[i - 2].speaker;
                    const indexOfPrev = characters.findIndex(char => char.id === prevSpeakerId);

                    // If found, calculate who should be next
                    if (indexOfPrev !== -1) {
                        // The "Natural Next" after FoodA
                        const nextNaturalIndex = indexOfPrev >= characters.length - 1 ? 0 : indexOfPrev + 1;

                        // If the current responder (FoodB) is NOT the Natural Next,
                        // then this was an out-of-turn response. We should ignore it 
                        // and resume the natural order (so return Natural Next).
                        // BUT, the loop below simply "calculates next from current found speaker".
                        // So if we just 'continue' here, we skip FoodB, skip Human, find FoodA, and standard logic returns Natural Next.

                        // Check if FoodB == Natural Next.
                        const currentResponderId = msg.speaker;
                        const currentResponderIndex = characters.findIndex(char => char.id === currentResponderId);

                        if (currentResponderIndex !== nextNaturalIndex) {
                            // It was out of turn. Skip this message so we find FoodA.
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
