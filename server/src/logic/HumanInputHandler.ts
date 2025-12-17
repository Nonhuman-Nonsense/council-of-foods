import { Logger } from "@utils/Logger.js";
import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "@utils/textUtils.js";
import { Character } from "@logic/SpeakerSelector.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@shared/SocketTypes.js";
import { ConversationMessage } from "@shared/ModelTypes.js";
import { IMeetingManager, ConversationOptions } from "@interfaces/MeetingInterfaces.js";

export interface HumanMessage {
    text: string;
    askParticular?: string;
    speaker?: string;
    id?: string;
    type?: string;
    sentences?: string[];
    [key: string]: any;
}

export interface InjectionMessage {
    text: string;
    date: string;
    index: number;
    length: number;
}

/**
 * Manages input from humans, including the primary user (questioner),
 * special panelists (via admin panel usually), and prototype scenarios.
 */
export class HumanInputHandler {
    manager: IMeetingManager;

    constructor(meetingManager: IMeetingManager) {
        this.manager = meetingManager;
    }

    /**
     * Handles the text submission from the user after they have raised their hand and been invited.
     * Validates that the state is 'awaiting_human_question' before processing.
     * Updates conversation w/ user text, triggers audio generation, and resumes the run loop.
     */
    handleSubmitHumanMessage(message: HumanMessage): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, `human input on index ${manager.conversation.length - 1} `);

        if (manager.conversation[manager.conversation.length - 1].type !== 'awaiting_human_question') {
            Logger.error(`meeting ${manager.meetingId}`, "Received a human question but was not expecting one!");
            return;
        }
        manager.conversation.pop();

        if (manager.conversation[manager.conversation.length - 1].type === 'invitation') {
            Logger.info(`meeting ${manager.meetingId}`, `popping invitation down to index ${manager.conversation.length - 1} `);
            manager.conversation.pop();
        }

        if (!manager.conversationOptions.state) {
            manager.conversationOptions.state = {};
        }

        if (message.askParticular) {
            Logger.info(`meeting ${manager.meetingId}`, `specifically asked to ${message.askParticular} `);
            message.text = message.speaker + " asked " + message.askParticular + ":\xa0" + message.text;
        } else {
            message.text = message.speaker + (manager.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        }

        const msgId = "human-" + uuidv4();
        message.id = msgId;
        message.type = "human";
        message.speaker = manager.conversationOptions.state.humanName;

        manager.conversation.push(message as ConversationMessage);

        if (manager.meetingId !== null) {
            manager.services.meetingsCollection.updateOne(
                { _id: manager.meetingId },
                { $set: { conversation: manager.conversation } }
            );
        }

        manager.socket.emit("conversation_update", manager.conversation);

        message.sentences = splitSentences(message.text);

        // Assert types for Queue compatibility
        const queueMsg = {
            id: msgId,
            sentences: message.sentences,
            ...message
        };

        if (manager.meetingId !== null) {
            manager.audioSystem.queueAudioGeneration(
                queueMsg,
                manager.conversationOptions.characters[0],
                manager.conversationOptions.options,
                manager.meetingId as number,
                manager.environment
            );
        }

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }

    /**
     * Handles input from a 'human panelist' (a human participant acting as a character/expert).
     * Validates that the state is 'awaiting_human_panelist'.
     */
    handleSubmitHumanPanelist(message: HumanMessage): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, `human panelist ${message.speaker} on index ${manager.conversation.length - 1} `);

        if (manager.conversation[manager.conversation.length - 1].type !== 'awaiting_human_panelist') {
            Logger.error(`meeting ${manager.meetingId}`, "Received a human panelist but was not expecting one!");
            return;
        }
        manager.conversation.pop();

        const charName = manager.conversationOptions.characters.find(c => c.id === message.speaker)?.name || "Unknown";
        message.text = charName + (manager.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        message.id = message.speaker + uuidv4();
        message.type = "panelist";

        manager.conversation.push(message as ConversationMessage);

        if (manager.meetingId !== null) {
            manager.services.meetingsCollection.updateOne(
                { _id: manager.meetingId },
                { $set: { conversation: manager.conversation } }
            );
        }

        manager.socket.emit("conversation_update", manager.conversation);

        message.sentences = splitSentences(message.text);

        const queueMsg = {
            id: message.id,
            sentences: message.sentences,
            ...message
        };

        if (manager.meetingId !== null) {
            manager.audioSystem.queueAudioGeneration(
                queueMsg,
                manager.conversationOptions.characters[0],
                manager.conversationOptions.options,
                manager.meetingId as number,
                manager.environment
            );
        }

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }

    /**
     * Handles injection of "Interjection" events, primarily for prototype demonstrations (e.g. "Time passes").
     */
    async handleSubmitInjection(message: InjectionMessage): Promise<void> {
        const { manager } = this;
        if (manager.environment !== "prototype") return;

        let { response, id } = await manager.dialogGenerator.chairInterjection(
            message.text.replace("[DATE]", message.date),
            message.index,
            message.length,
            true,
            manager.conversation,
            manager.conversationOptions,
            manager.socket
        );

        let summary: any = { // Using any as summary structure might vary or reuse Message interface
            id: id,
            speaker: manager.conversationOptions.characters[0].id,
            text: response,
            type: "interjection",
        };

        manager.conversation.push(summary);

        manager.socket.emit("conversation_update", manager.conversation);
        Logger.info(`meeting ${manager.meetingId}`, `interjection generated on index ${manager.conversation.length - 1} `);

        summary.sentences = splitSentences(response);

        if (manager.meetingId !== null) {
            manager.audioSystem.queueAudioGeneration(
                summary,
                manager.conversationOptions.characters[0],
                manager.conversationOptions.options,
                manager.meetingId as number,
                manager.environment
            );
        }
    }
}
