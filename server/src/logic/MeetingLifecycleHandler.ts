import type { Character, ConversationMessage } from '@shared/ModelTypes.js';
import type { ILifecycleContext, ConversationOptions } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioMessage } from "@logic/AudioSystem.js";
import { splitSentences } from "@utils/textUtils.js";
import { Logger } from "@utils/Logger.js";
import { GlobalOptions } from "@logic/GlobalOptions.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";
import removeMd from 'remove-markdown';

export interface SetupOptions {
    options?: Partial<GlobalOptions>;
    characters: Character[];
    language: string;
    topic: string;
}

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
     * Initializes a new conversation/meeting.
     * Sets up global state, stores initial record in DB, and kicks off the run loop.
     */
    async handleStartConversation(setup: SetupOptions): Promise<void> {
        const { manager } = this;
        manager.conversationOptions = setup as ConversationOptions; // Initial cast, will be populated
        if (manager.environment === "prototype") {
            manager.conversationOptions.options = { ...manager.globalOptions, ...(setup.options || {}) };
        } else {
            manager.conversationOptions.options = manager.globalOptions;
        }

        manager.conversation = [];
        manager.currentSpeaker = 0;
        manager.extraMessageCount = 0;
        manager.isPaused = false;
        manager.handRaised = false;
        manager.meetingDate = new Date();

        manager.conversationOptions.state = {
            alreadyInvited: false
        };

        const storeResult = await manager.services.insertMeeting({
            options: manager.conversationOptions,
            audio: [],
            conversation: [],
            date: manager.meetingDate.toISOString(),
        });

        manager.meetingId = storeResult.insertedId;

        manager.broadcaster.broadcastMeetingStarted(manager.meetingId);
        Logger.info(`meeting ${manager.meetingId}`, `started (session ${manager.socket.id})`);
        manager.startLoop();
    }

    /**
     * Ends the meeting by generating a final summary from the Chair.
     * Persists the summary to DB and emits update.
     */
    async handleWrapUpMeeting(message: WrapUpMessage): Promise<void> {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "attempting to wrap up");
        const summaryPrompt = manager.conversationOptions.options.finalizeMeetingPrompt[manager.conversationOptions.language].replace("[DATE]", message.date);

        // Note: chairInterjection is on manager (delegated to DialogGenerator)
        let { response, id } = await manager.dialogGenerator.chairInterjection(
            summaryPrompt,
            manager.conversation.length,
            manager.conversationOptions.options.finalizeMeetingLength,
            true,
            manager.conversation,
            manager.conversationOptions,
            manager.broadcaster
        );

        // Strip markdown formatting for TTS (prevents reading "**banana**" as "asterisk banana asterisk")
        const textForAudio = removeMd(response);

        let summary: ConversationMessage = {
            id: id || "",
            speaker: manager.conversationOptions.characters[0].id,
            text: response, // Keep markdown for display
            type: "summary",
            sentences: []
        };

        manager.conversation.push(summary);

        manager.broadcaster.broadcastConversationUpdate(manager.conversation);
        Logger.info(`meeting ${manager.meetingId}`, `summary generated on index ${manager.conversation.length - 1}`);

        if (manager.meetingId !== null) {
            manager.services.meetingsCollection.updateOne(
                { _id: manager.meetingId },
                { $set: { conversation: manager.conversation, summary: summary } }
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

        if (manager.meetingId !== null) {
            await manager.audioSystem.generateAudio(
                audioMessage as AudioMessage,
                manager.conversationOptions.characters[0],
                manager.conversationOptions,
                manager.meetingId,
                manager.environment,
                true
            );
        }
    }

    /**
     * Handles request for OpenAI Realtime API Client Key (for client-side usage).
     * Fetches ephemeral secret from OpenAI and returns to client.
     */
    async handleRequestClientKey(): Promise<void> {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "clientkey requested");
        try {
            const sessionConfig = JSON.stringify({
                session: {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "noise_reduction": {
                                "type": "near_field"
                            },
                            "transcription": {
                                "model": manager.conversationOptions.options.transcribeModel,
                                "prompt": manager.conversationOptions.options.transcribePrompt[manager.conversationOptions.language],
                                "language": manager.conversationOptions.language
                            },
                            "turn_detection": {
                                "type": "server_vad",
                                "threshold": 0.5,
                                "prefix_padding_ms": 300,
                                "silence_duration_ms": 500
                            }
                        }
                    }
                }
            });

            const openai = manager.services.getOpenAI();
            const response = await withNetworkRetry(() => fetch(
                "https://api.openai.com/v1/realtime/client_secrets",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${openai.apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: sessionConfig,
                }
            ), "MeetingLifecycleHandler");

            const data = await response.json();
            manager.broadcaster.broadcastClientKey(data);
            Logger.info(`meeting ${manager.meetingId}`, "clientkey sent");
        } catch (error) {
            Logger.reportAndCrashClient(`meeting ${manager.meetingId}`, "Failed to initialize realtime transcription.", error, manager.broadcaster);
        }
    }

    /**
     * Extends the meeting length and resumes the conversation loop if it had stopped due to length limits.
     */
    handleContinueConversation(): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "continuing conversation");
        manager.extraMessageCount += manager.globalOptions.extraMessageCount;
        manager.startLoop();
    }

    /**
     * Pauses the conversation.
     */
    handlePauseConversation(): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "paused");
        manager.isPaused = true;
    }

    /**
     * Resumes the conversation.
     */
    handleResumeConversation(): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "resumed");
        manager.isPaused = false;
        manager.startLoop();
    }

    /**
     * Removes the last message from the conversation (prototype functionality).
     */
    handleRemoveLastMessage(): void {
        const { manager } = this;
        Logger.info(`meeting ${manager.meetingId}`, "popping last message");
        manager.conversation.pop();
        manager.broadcaster.broadcastConversationUpdate(manager.conversation);
    }
}
