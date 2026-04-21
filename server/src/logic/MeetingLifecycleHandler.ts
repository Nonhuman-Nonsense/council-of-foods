import type { Message } from '@shared/ModelTypes.js';
import type { SetupOptions } from '@shared/SocketTypes.js';
import type { ILifecycleContext } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioMessage } from "@logic/AudioSystem.js";
import { splitSentences } from "@utils/textUtils.js";
import { Logger } from "@utils/Logger.js";
import removeMd from 'remove-markdown';
import type { StoredMeeting } from "@models/DBModels.js";

interface WrapUpMessage {
    date: string;
}

/**
 * Manages the high-level lifecycle of a meeting: Start, Wrap-Up, and Continuation.
 * Handles initialization of session state, emitting lifecycle events, and managing the End-of-Meeting summary flow.
 */
export class MeetingLifecycleHandler {
    manager: ILifecycleContext;

    constructor(meetingManager: ILifecycleContext) {
        this.manager = meetingManager;
    }

    /**
     * Connects to the meeting and starts the conversation loop.
     */
    async handleStartConversation(setup: SetupOptions): Promise<void> {
        const { manager } = this;

        // Fetch the meeting from the DB
        const meeting = await manager.services.meetingsCollection.findOne({ _id: setup.meetingId });
        if (!meeting) {
            throw new Error("Meeting not found");
        }

        if(meeting.liveKey !== setup.liveKey) {
            throw new Error("Invalid live key");
        }

        const stored: StoredMeeting = meeting as StoredMeeting;
        manager.meeting = stored;
        // Session serverOptions come from MeetingManager constructor (SocketManager merges prototype overrides from start_conversation).

        Logger.info(`meeting ${stored._id}`, `started (session ${manager.socket.id})`);
        manager.startLoop();
    }

    /**
     * Ends the meeting by generating a final summary from the Chair.
     * Persists the summary to DB and emits update.
     */
    async handleWrapUpMeeting(message: WrapUpMessage): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "attempting to wrap up");

        //remove the max reached message
        const mr = m.conversation.findIndex((m) => m.type === "max_reached");
        if(mr === -1) {
            throw new Error("Attempted to wrap up meeting but not at max reached");
        }
        m.conversation = m.conversation.slice(0, mr);

        //generate the summary
        const summaryPrompt = manager.serverOptions.finalizeMeetingPrompt[m.language].replace("[DATE]", message.date);

        // Note: chairInterjection is on manager (delegated to DialogGenerator)
        const { response, id } = await manager.dialogGenerator.chairInterjection(
            summaryPrompt,
            m.conversation.length,
            manager.serverOptions.finalizeMeetingLength,
            true,
            m,
            manager.broadcaster
        );

        // Strip markdown formatting for TTS (prevents reading "**banana**" as "asterisk banana asterisk")
        const textForAudio = removeMd(response);

        const summary: Message = {
            id: id || "",
            speaker: m.characters[0].id,
            text: response, // Keep markdown for display
            type: "summary",
            sentences: []
        };

        m.conversation.push(summary);

        manager.broadcaster.broadcastConversationUpdate(m.conversation);
        Logger.info(`meeting ${m._id}`, `summary generated on index ${m.conversation.length - 1}`);

        if (m._id !== null) {
            manager.services.meetingsCollection.updateOne(
                { _id: m._id },
                { $set: { conversation: m.conversation, summary: summary } }
            );
        }

        // Create a specific message payload for audio generation with stripped text
        // We split sentences based on the *audio* text so alignment works accurately
        const audioMessage = {
            ...summary,
            text: textForAudio,
            sentences: splitSentences(textForAudio)
        };

        // Also update the main summary object's sentences for consistency, though they won't have timings yet
        summary.sentences = splitSentences(response);

        if (m._id !== null) {
            await manager.audioSystem.generateAudio(
                audioMessage as AudioMessage,
                m.characters[0],
                m.language,
                manager.serverOptions,
                m,
                manager.environment,
                true
            );
        }
    }

    /**
     * Extends the meeting length and resumes the conversation loop if it had stopped due to length limits.
     */
    async handleContinueConversation(): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "continuing conversation");

        //remove the max reached message
        const mr = m.conversation.findIndex((m) => m.type === "max_reached");
        if(mr === -1) {
            throw new Error("Attempted to continue meeting but not at max reached");
        }
        m.conversation = m.conversation.slice(0, mr);

        //if the conversation extra slots is undefined, set it to 0, could happen if the meeting is legacy
        //TODO: Could we have a problem here if we view an old meeting that is already past the max reached?
        //TODO: Should we migrate all old data to set conversationsExtraSlots if more than 10? No because meetings could have different settings?
        if(m.conversationExtraSlots === undefined) {
            m.conversationExtraSlots = 0;
        }
        m.conversationExtraSlots += manager.serverOptions.extraMessageCount;

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation, conversationExtraSlots: m.conversationExtraSlots } }
        );

        manager.startLoop();
    }

    /**
     * Pauses the conversation.
     */
    handlePauseConversation(): void {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "paused");
        manager.isPaused = true;
    }

    /**
     * Resumes the conversation.
     */
    handleResumeConversation(): void {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "resumed");
        manager.isPaused = false;
        manager.startLoop();
    }

    /**
     * Removes the last message from the conversation (prototype functionality).
     */
    handleRemoveLastMessage(): void {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "popping last message");
        m.conversation.pop();
        manager.broadcaster.broadcastConversationUpdate(m.conversation);
    }
}
