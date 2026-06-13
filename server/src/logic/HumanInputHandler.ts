import type { HumanMessage, Message, PanelistMessage } from "@shared/ModelTypes.js";
import type { SubmitHumanMessagePayload, SubmitHumanPanelistPayload } from "@shared/SocketTypes.js";
import type { IHumanInputContext } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioQueueMessage } from "@logic/audio/AudioTypes.js";
import { Logger } from "@utils/Logger.js";
import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "@shared/textUtils.js";
import { annotateDirectedHandoff } from "@logic/directedHandoff.js";

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
    async handleSubmitHumanMessage(payload: SubmitHumanMessagePayload): Promise<void> {
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

        const humanName = m.state.humanName || "Human";
        const askParticular = await this.manager.speakerTargetClassifier.inferTarget(m, {
            mode: "humanQuestion",
            text: payload.text,
        });

        const renderedText = humanName + (m.language === 'en' ? " said:\xa0" : " sa:\xa0") + payload.text;

        const msgId = "human-" + uuidv4();
        const message: HumanMessage = {
            id: msgId,
            type: "human",
            speaker: humanName,
            text: renderedText,
            askParticular,
        };

        m.conversation.push(message);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        message.sentences = splitSentences(message.text);

        // Assert types for Queue compatibility
        const queueMsg = {
            ...message,
            sentences: message.sentences,
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
    async handleSubmitHumanPanelist(payload: SubmitHumanPanelistPayload): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, `human panelist ${payload.speaker} on index ${m.conversation.length - 1} `);

        if (m.conversation[m.conversation.length - 1].type !== 'awaiting_human_panelist') {
            Logger.error(`meeting ${m._id}`, "Received a human panelist but was not expecting one!");
            return;
        }
        m.conversation.pop();

        const charName = m.characters.find(c => c.id === payload.speaker)?.name || "Unknown";
        const message: PanelistMessage = {
            id: payload.speaker + uuidv4(),
            type: "panelist",
            speaker: payload.speaker,
            text: charName + (m.language === 'en' ? " said:\xa0" : " sa:\xa0") + payload.text,
        };

        await annotateDirectedHandoff(this.manager.speakerTargetClassifier, this.manager.serverOptions, m, message);

        m.conversation.push(message);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        message.sentences = splitSentences(message.text);

        const queueMsg = {
            ...message,
            sentences: message.sentences,
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
     * Handles injection of "Interjection" events, only on prototype
     */
    async handleSubmitInjection(message: InjectionMessage): Promise<void> {
        const { manager } = this;
        if (manager.environment !== "prototype") return;

        const m = manager.meeting;
        if (!m) return;

        const { response, id } = await manager.dialogGenerator.chairInterjection(
            message.text.replace("[DATE]", message.date),
            message.index,
            message.length,
            true,
            m,
            manager.broadcaster
        );

        const summary: Message = {
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
