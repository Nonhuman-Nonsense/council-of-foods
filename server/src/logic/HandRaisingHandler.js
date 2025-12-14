import { splitSentences } from "../utils/textUtils.js";

export class HandRaisingHandler {
    constructor(meetingManager) {
        this.manager = meetingManager;
    }

    async handleRaiseHand(handRaisedOptions) {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] hand raised on index ${handRaisedOptions.index - 1}`);
        manager.handRaised = true;
        manager.conversationOptions.state.humanName = handRaisedOptions.humanName;

        // Cut everything after the raised index
        manager.conversation = manager.conversation.slice(0, handRaisedOptions.index);

        if (!manager.conversationOptions.state.alreadyInvited) {
            let { response, id } = await manager.dialogGenerator.chairInterjection(
                manager.conversationOptions.options.raiseHandPrompt[manager.conversationOptions.language].replace(
                    "[NAME]",
                    manager.conversationOptions.state.humanName
                ),
                handRaisedOptions.index,
                manager.conversationOptions.options.raiseHandInvitationLength,
                true,
                manager.conversation,
                manager.conversationOptions,
                manager.socket
            );

            const firstNewLineIndex = response.indexOf("\n\n");
            if (firstNewLineIndex !== -1) {
                response = response.substring(0, firstNewLineIndex);
            }

            const message = {
                id: id,
                speaker: manager.conversationOptions.characters[0].id,
                text: response,
                type: "invitation",
                message_index: handRaisedOptions.index,
            }

            manager.conversation.push(message);
            message.sentences = splitSentences(message.text);

            manager.conversationOptions.state.alreadyInvited = true;
            console.log(`[meeting ${manager.meetingId}] invitation generated, on index ${handRaisedOptions.index}`);

            manager.audioSystem.queueAudioGeneration(
                message,
                manager.conversationOptions.characters[0],
                manager.conversationOptions.options,
                manager.meetingId,
                manager.environment
            );
        }

        manager.conversation.push({
            type: 'awaiting_human_question',
            speaker: manager.conversationOptions.state.humanName
        });

        console.log(`[meeting ${manager.meetingId}] awaiting human question on index ${manager.conversation.length - 1} `);

        manager.services.meetingsCollection.updateOne(
            { _id: manager.meetingId },
            { $set: { conversation: manager.conversation, 'options.state': manager.conversationOptions.state } }
        );

        manager.socket.emit("conversation_update", manager.conversation);
    }
}
