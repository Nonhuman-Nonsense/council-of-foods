import type { Message } from "@shared/ModelTypes.js";
import type { IHumanInputContext } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioQueueMessage } from "@logic/audio/AudioTypes.js";
import { Logger } from "@utils/Logger.js";
import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "@utils/textUtils.js";

export interface HumanMessage {
    text: string;
    askParticular?: string;
    speaker?: string;
    id?: string;
    type?: string;
    sentences?: string[];
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
    manager: IHumanInputContext;

    constructor(meetingManager: IHumanInputContext) {
        this.manager = meetingManager;
    }

    /**
     * Handles the text submission from the user after they have raised their hand and been invited.
     * Validates that the state is 'awaiting_human_question' before processing.
     * Updates conversation w/ user text, triggers audio generation, and resumes the run loop.
     */
    async handleSubmitHumanMessage(message: HumanMessage): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, `human input on index ${m.conversation.length - 1} `);

        if (m.conversation[m.conversation.length - 1].type !== 'awaiting_human_question') {
            Logger.error(`meeting ${m._id}`, "Received a human question but was not expecting one!");
            return;
        }
        m.conversation.pop();

        if (m.conversation[m.conversation.length - 1].type === 'invitation') {
            Logger.info(`meeting ${m._id}`, `popping invitation down to index ${m.conversation.length - 1} `);
            m.conversation.pop();
        }

        if (message.askParticular) {
            Logger.info(`meeting ${m._id}`, `specifically asked to ${message.askParticular} `);
            message.text = message.speaker + " asked " + message.askParticular + ":\xa0" + message.text;
        } else {
            message.text = message.speaker + (m.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        }

        const msgId = "human-" + uuidv4();
        message.id = msgId;
        message.type = "human";
        message.speaker = m.state.humanName;

        m.conversation.push(message as Message);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        message.sentences = splitSentences(message.text);

        // Assert types for Queue compatibility
        const queueMsg = {
            id: msgId,
            sentences: message.sentences,
            ...message
        } as AudioQueueMessage;

        manager.audioSystem.queueAudioGeneration(
            queueMsg,
            m.characters[0],
            m,
            manager.environment,
            manager.serverOptions
        );

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }

    /**
     * Handles input from a 'human panelist' (a human participant acting as a character/expert).
     * Validates that the state is 'awaiting_human_panelist'.
     */
    async handleSubmitHumanPanelist(message: HumanMessage): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, `human panelist ${message.speaker} on index ${m.conversation.length - 1} `);

        if (m.conversation[m.conversation.length - 1].type !== 'awaiting_human_panelist') {
            Logger.error(`meeting ${m._id}`, "Received a human panelist but was not expecting one!");
            return;
        }
        m.conversation.pop();

        const charName = m.characters.find(c => c.id === message.speaker)?.name || "Unknown";
        message.text = charName + (m.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        message.id = message.speaker + uuidv4();
        message.type = "panelist";

        m.conversation.push(message as Message);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        message.sentences = splitSentences(message.text);

        const queueMsg = {
            id: message.id!,
            sentences: message.sentences,
            ...message
        } as AudioQueueMessage;

        manager.audioSystem.queueAudioGeneration(
            queueMsg,
            m.characters[0],
            m,
            manager.environment,
            manager.serverOptions
        );

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

        const m = manager.meeting;
        if (!m) return;

        let { response, id } = await manager.dialogGenerator.chairInterjection(
            message.text.replace("[DATE]", message.date),
            message.index,
            message.length,
            true,
            m,
            manager.broadcaster
        );

        let summary: Message = {
            id: id || "",
            speaker: m.characters[0].id,
            text: response,
            type: "interjection",
            sentences: []
        };

        m.conversation.push(summary);

        manager.broadcaster.broadcastConversationUpdate(m.conversation);
        Logger.info(`meeting ${m._id}`, `interjection generated on index ${m.conversation.length - 1} `);

        summary.sentences = splitSentences(response);

        manager.audioSystem.queueAudioGeneration(
            summary as AudioQueueMessage,
            m.characters[0],
            m,
            manager.environment,
            manager.serverOptions
        );
    }
}
