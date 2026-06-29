import type { Message } from '@shared/ModelTypes.js';
import type { ConcludeMeetingMessage, SetupOptions } from '@shared/SocketTypes.js';
import type { ILifecycleContext } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioMessage } from "@logic/AudioSystem.js";
import { splitSentences } from "@shared/textUtils.js";
import { Logger } from "@utils/Logger.js";
import removeMd from 'remove-markdown';
import type { StoredMeeting } from "@models/DBModels.js";

/**
 * Manages the high-level lifecycle of a meeting: Start, Conclude, Extend, and Summarize.
 * Handles initialization of session state, emitting lifecycle events, and managing the end-of-meeting flow.
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
     * Concludes the meeting: chair closing line (broadcast immediately), then summary.
     */
    async handleConcludeMeeting(message: ConcludeMeetingMessage): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "attempting to conclude meeting");

        const queryExtensionIndex = m.conversation.findIndex((m) => m.type === "query_extension");
        if (queryExtensionIndex !== -1) {
            m.conversation = m.conversation.slice(0, queryExtensionIndex);
        } else {
            Logger.info(`meeting ${m._id}`, 'conclude meeting without query_extension sentinel (hard cap auto conclude)');
        }

        const chair = m.characters[0];
        const closingIndex = m.conversation.length;
        const closingPrompt = manager.serverOptions.concludeMeetingPrompt[m.language]
            .replaceAll("[MEETING_ID]", String(m._id));
        const {
            response: closingText,
            id: closingId,
            trimmed: closingTrimmed,
            pretrimmed: closingPretrimmed,
            sentences: closingSentences,
        } = await manager.dialogGenerator.chairInterjection(
            closingPrompt,
            closingIndex,
            manager.serverOptions.concludeMeetingLength,
            true,
            m,
            manager.broadcaster
        );

        const closingMessage: Message = {
            id: closingId || "",
            speaker: chair.id,
            text: closingText,
            type: "message",
            sentences: closingSentences || splitSentences(closingText),
            trimmed: closingTrimmed,
            pretrimmed: closingPretrimmed,
        };

        m.conversation.push(closingMessage);
        Logger.info(`meeting ${m._id}`, `closing statement generated on index ${closingIndex}`);

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        if (m._id !== null) {
            await manager.services.meetingsCollection.updateOne(
                { _id: m._id },
                { $set: { conversation: m.conversation } }
            );

            manager.audioSystem.queueAudioGeneration(
                { ...closingMessage, id: closingMessage.id as string, text: closingMessage.text as string, sentences: closingMessage.sentences! },
                chair,
                m,
                manager.environment,
                manager.serverOptions
            );
        }

        await this.summarizeMeeting(message.date);
    }

    /**
     * Generates and persists the meeting summary after the chair closing line.
     */
    private async summarizeMeeting(date: string): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        const chair = m.characters[0];
        const summaryPrompt = manager.serverOptions.summarizeMeetingPrompt[m.language].replace("[DATE]", date);
        const {
            response,
            id,
            trimmed,
            pretrimmed,
            sentences: summarySentences,
        } = await manager.dialogGenerator.chairInterjection(
            summaryPrompt,
            m.conversation.length,
            manager.serverOptions.summarizeMeetingLength,
            true,
            m,
            manager.broadcaster
        );

        // Strip markdown formatting for TTS (prevents reading "**banana**" as "asterisk banana asterisk")
        const textForAudio = removeMd(response);

        const summary: Message = {
            id: id || "",
            speaker: chair.id,
            text: response,
            type: "summary",
            sentences: summarySentences || [],
            trimmed,
            pretrimmed,
        };

        m.conversation.push(summary);

        manager.broadcaster.broadcastConversationUpdate(m.conversation);
        Logger.info(`meeting ${m._id}`, `summary generated on index ${m.conversation.length - 1}`);

        if (m._id !== null) {
            await manager.services.meetingsCollection.updateOne(
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
            void manager.audioSystem.generateAudio(
                audioMessage as AudioMessage,
                chair,
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
    async handleExtendMeeting(): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "extending meeting");

        // Strip query_extension sentinel before extending.
        const queryExtensionIndex = m.conversation.findIndex((m) => m.type === "query_extension");
        if (queryExtensionIndex === -1) {
            throw new Error("Attempted to extend meeting but not at query_extension sentinel");
        }
        m.conversation = m.conversation.slice(0, queryExtensionIndex);

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
