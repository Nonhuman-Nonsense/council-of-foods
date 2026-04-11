import type { Message } from "@shared/ModelTypes.js";
import type { IHandRaisingContext } from "@interfaces/MeetingInterfaces.js";
import { splitSentences } from "@utils/textUtils.js";
import { Logger } from "@utils/Logger.js";


export interface HandRaisedOptions {
    index: number;
    humanName: string;
}

/**
 * Manages the "Raise Hand" interaction flow.
 * Handles the user interrupt, truncating conversation, generating the Chair's invitation,
 * and transitioning state to await a human question.
 */
export class HandRaisingHandler {
    manager: IHandRaisingContext;

    constructor(meetingManager: IHandRaisingContext) {
        this.manager = meetingManager;
    }

    /**
     * Processes a "Raise Hand" event from the client.
     * 1. Sets/Updates global state (humanName, handRaised flag).
     * 2. Truncates conversation to the insertion point.
     * 3. Generates an invitation from the Chair (if one hasn't been generated yet).
     * 4. Pushes 'awaiting_human_question' state marker to conversation.
     * 5. Persists state and updates client.
     */
    async handleRaiseHand(handRaisedOptions: HandRaisedOptions): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) {
            Logger.error("HandRaisingHandler", "raise_hand with no active meeting");
            return;
        }

        Logger.info(`meeting ${m._id}`, `hand raised on index ${handRaisedOptions.index - 1}`);

        manager.handRaised = true;
        m.state.humanName = handRaisedOptions.humanName;

        // Cut everything after the raised index
        m.conversation = m.conversation.slice(0, handRaisedOptions.index);

        if (!m.state.alreadyInvited) {
            let { response, id } = await manager.dialogGenerator.chairInterjection(
                manager.serverOptions.raiseHandPrompt[m.language].replace(
                    "[NAME]",
                    m.state.humanName || "Human"
                ),
                handRaisedOptions.index,
                manager.serverOptions.raiseHandInvitationLength,
                true,
                m,
                manager.broadcaster
            );

            const firstNewLineIndex = response.indexOf("\n\n");
            if (firstNewLineIndex !== -1) {
                response = response.substring(0, firstNewLineIndex);
            }

            const message: Message = {
                id: id as string,
                speaker: m.characters[0].id,
                text: response,
                type: "invitation",
                sentences: [] // Will be populated
            }

            m.conversation.push(message);
            message.sentences = splitSentences(message.text as string);

            m.state.alreadyInvited = true;
            Logger.info(`meeting ${m._id}`, `invitation generated, on index ${handRaisedOptions.index}`);

            manager.audioSystem.queueAudioGeneration(
                { ...message, id: message.id as string, text: message.text as string, sentences: message.sentences! },
                m.characters[0],
                m,
                manager.environment,
                manager.serverOptions
            );
        }

        m.conversation.push({
            type: 'awaiting_human_question',
            speaker: m.state.humanName,
            text: ""
        } as Message);

        Logger.info(`meeting ${m._id}`, `awaiting human question on index ${m.conversation.length - 1} `);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation, state: m.state } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);
    }
}
