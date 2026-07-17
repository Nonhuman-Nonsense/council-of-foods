import type { HumanMessage, Message, PanelistMessage } from "@shared/ModelTypes.js";
import type { SubmitHumanMessagePayload, SubmitHumanPanelistPayload } from "@shared/SocketTypes.js";
import type { IHumanInputContext } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioQueueMessage } from "@logic/audio/AudioTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { UpdateFilter } from "mongodb";
import { Logger } from "@utils/Logger.js";
import { v4 as uuidv4 } from "uuid";
import { splitSentences } from "@shared/textUtils.js";
import { annotateDirectedHandoff } from "@logic/directedHandoff.js";

/**
 * Manages input from humans, including the primary user (questioner)
 * and special panelists (via admin panel usually).
 */
export class HumanInputHandler {
    manager: IHumanInputContext;

    constructor(meetingManager: IHumanInputContext) {
        this.manager = meetingManager;
    }

    private async popInvitationIfPresent(m: StoredMeeting): Promise<void> {
        const invitation = m.conversation[m.conversation.length - 1];
        if (invitation?.type !== "invitation" || !invitation.id) {
            return;
        }

        const audioId = invitation.id;
        m.conversation.pop();
        Logger.info("humanInput", `popping invitation down to index ${m.conversation.length - 1}`, { from: this.manager });

        // Driver types don't accept $pull on string[] when the schema extends Document.
        await this.manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $pull: { audio: audioId } } as unknown as UpdateFilter<StoredMeeting>
        );
        m.audio = (m.audio ?? []).filter((id) => id !== audioId);
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

        Logger.info("humanInput", `human input on index ${m.conversation.length - 1} `, { from: manager });

        const lastMessage = m.conversation[m.conversation.length - 1];
        if (lastMessage?.type !== 'awaiting_human_question') {
            // Stale event — socket buffer flushed before attempt_reconnection completed.
            // Server is not in the right state to accept this; discard gracefully.
            Logger.staleEvent("humanInput", "submit_human_message", `expected awaiting_human_question but found '${lastMessage?.type ?? "none"}'`, { lastReconnectionAt: manager.lastReconnectionAt, from: manager });
            return;
        }
        m.conversation.pop();

        await this.popInvitationIfPresent(m);

        const humanName = m.state.humanName || "Human";
        const askParticular = await this.manager.speakerTargetClassifier.inferTarget(m, {
            mode: "humanQuestion",
            text: payload.text,
            speakerId: humanName,
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

        if (askParticular) {
            Logger.info("humanInput", `${humanName} asked directly to ${askParticular}`, { from: manager });
        }

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

        Logger.info("humanInput", `human panelist ${payload.speaker} on index ${m.conversation.length - 1} `, { from: manager });

        const lastMessage = m.conversation[m.conversation.length - 1];
        if (lastMessage?.type !== 'awaiting_human_panelist') {
            // Stale event — socket buffer flushed before attempt_reconnection completed.
            Logger.staleEvent("humanInput", "submit_human_panelist", `expected awaiting_human_panelist but found '${lastMessage?.type ?? "none"}'`, { lastReconnectionAt: manager.lastReconnectionAt, from: manager });
            return;
        }
        m.conversation.pop();

        await this.popInvitationIfPresent(m);

        const charName = m.characters.find(c => c.id === payload.speaker)?.name || "Unknown";
        const message: PanelistMessage = {
            id: payload.speaker + uuidv4(),
            type: "panelist",
            speaker: payload.speaker,
            text: charName + (m.language === 'en' ? " said:\xa0" : " sa:\xa0") + payload.text,
        };

        await annotateDirectedHandoff(this.manager.speakerTargetClassifier, this.manager.serverOptions, m, message);

        m.conversation.push(message);

        if (message.askParticular) {
            Logger.info("humanInput", `${payload.speaker} asked directly to ${message.askParticular}`, { from: manager });
        }

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
     * Skips the visitor's turn when they abandon input (e.g. museum idle timeout).
     * Validates awaiting state, replaces invitation+awaiting with a skipped marker, resumes the loop.
     */
    async handleSkipHumanTurn(): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        const lastMessage = m.conversation[m.conversation.length - 1];
        if (lastMessage?.type !== "awaiting_human_question" && lastMessage?.type !== "awaiting_human_panelist") {
            // Stale event — socket buffer flushed before attempt_reconnection completed.
            Logger.staleEvent("humanInput", "skip_human_turn", `expected awaiting human input but found '${lastMessage?.type ?? "none"}'`, { lastReconnectionAt: manager.lastReconnectionAt, from: manager });
            return;
        }

        const speaker =
            lastMessage.type === "awaiting_human_panelist"
                ? lastMessage.speaker
                : (m.state.humanName || "Human");

        m.conversation.pop();

        await this.popInvitationIfPresent(m);

        const skipped: Message = {
            id: `skipped-${uuidv4()}`,
            type: "skipped",
            speaker,
            text: "",
        };

        m.conversation.push(skipped);

        const skippedIndex = m.conversation.length - 1;
        if (lastMessage.type === "awaiting_human_panelist") {
            Logger.info("humanInput", `human panelist ${speaker} skipped on index ${skippedIndex}`, { from: manager });
        } else {
            Logger.info("humanInput", `human question skipped for ${speaker} on index ${skippedIndex}`, { from: manager });
        }

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        manager.isPaused = false;
        manager.handRaised = false;
        manager.startLoop();
    }
}
