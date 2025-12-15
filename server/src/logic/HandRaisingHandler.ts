import { splitSentences } from "../utils/textUtils.js";
import { Character, ConversationMessage } from "./SpeakerSelector.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "../models/SocketTypes.js";

// Define a local interface for MeetingManager functionality needed here.
// Once MeetingManager is migrated, we can export this or import the real class type.
interface ConversationState {
    humanName?: string;
    alreadyInvited?: boolean;
    [key: string]: any;
}

interface ConversationOptions {
    state: ConversationState;
    language: string;
    options: any;
    characters: Character[];
}

interface IMeetingManager {
    meetingId: string | number | null; // Allowing union until full migration to number everywhere
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    conversation: ConversationMessage[];
    conversationOptions: ConversationOptions;
    handRaised: boolean;
    dialogGenerator: any; // To be typed later
    audioSystem: any; // To be typed later or import AudioSystem type
    services: any; // To be typed later
    environment: string;
}

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
    manager: IMeetingManager;

    constructor(meetingManager: IMeetingManager) {
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

            const message: ConversationMessage = {
                id: id,
                speaker: manager.conversationOptions.characters[0].id,
                text: response,
                type: "invitation",
                message_index: handRaisedOptions.index,
                sentences: [] // Will be populated
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
            speaker: manager.conversationOptions.state.humanName,
            text: ""
        } as ConversationMessage);

        console.log(`[meeting ${manager.meetingId}] awaiting human question on index ${manager.conversation.length - 1} `);

        manager.services.meetingsCollection.updateOne(
            { _id: manager.meetingId },
            { $set: { conversation: manager.conversation, 'options.state': manager.conversationOptions.state } }
        );

        manager.socket.emit("conversation_update", manager.conversation);
    }
}
