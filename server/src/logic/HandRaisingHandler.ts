import { splitSentences } from "@utils/textUtils.js";
import { ConversationMessage } from "@shared/ModelTypes.js";
import { Logger } from "@utils/Logger.js";

import { IHandRaisingContext } from "@interfaces/MeetingInterfaces.js";

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
        Logger.info(`meeting ${manager.meetingId}`, `hand raised on index ${handRaisedOptions.index - 1}`);
        if (!manager.conversationOptions.state) {
            manager.conversationOptions.state = {};
        }

        manager.handRaised = true;
        manager.conversationOptions.state.humanName = handRaisedOptions.humanName;

        // Cut everything after the raised index
        manager.conversation = manager.conversation.slice(0, handRaisedOptions.index);

        if (!manager.conversationOptions.state.alreadyInvited) {
            let { response, id } = await manager.dialogGenerator.chairInterjection(
                manager.conversationOptions.options.raiseHandPrompt[manager.conversationOptions.language].replace(
                    "[NAME]",
                    manager.conversationOptions.state.humanName || "Human"
                ),
                handRaisedOptions.index,
                manager.conversationOptions.options.raiseHandInvitationLength,
                true,
                manager.conversation,
                manager.conversationOptions,
                manager.broadcaster
            );

            const firstNewLineIndex = response.indexOf("\n\n");
            if (firstNewLineIndex !== -1) {
                response = response.substring(0, firstNewLineIndex);
            }

            const message: ConversationMessage = {
                id: id as string,
                speaker: manager.conversationOptions.characters[0].id,
                text: response,
                type: "invitation",
                sentences: [] // Will be populated
            }

            manager.conversation.push(message);
            // Cast message to any or ensure it matches what Queue expects (AudioSystem expects Message with text/id)
            // Ideally define a comprehensive Message type or use intersection
            message.sentences = splitSentences(message.text as string);

            manager.conversationOptions.state.alreadyInvited = true;
            Logger.info(`meeting ${manager.meetingId}`, `invitation generated, on index ${handRaisedOptions.index}`);

            if (manager.meetingId !== null) {
                manager.audioSystem.queueAudioGeneration(
                    { ...message, id: message.id as string, text: message.text as string, sentences: message.sentences! },
                    manager.conversationOptions.characters[0],
                    manager.conversationOptions.options,
                    manager.meetingId as number,
                    manager.environment
                );
            }
        }

        manager.conversation.push({
            type: 'awaiting_human_question',
            speaker: manager.conversationOptions.state.humanName,
            text: ""
        } as ConversationMessage);

        Logger.info(`meeting ${manager.meetingId}`, `awaiting human question on index ${manager.conversation.length - 1} `);

        if (manager.meetingId !== null) {
            await manager.services.meetingsCollection.updateOne(
                { _id: manager.meetingId },
                { $set: { conversation: manager.conversation, 'options.state': manager.conversationOptions.state } }
            );
        }

        manager.broadcaster.broadcastConversationUpdate(manager.conversation);
    }
}
