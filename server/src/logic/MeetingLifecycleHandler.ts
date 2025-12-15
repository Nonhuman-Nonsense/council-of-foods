import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";
import { Logger } from "../utils/Logger.js";
import { Character, ConversationMessage } from "./SpeakerSelector.js";
import { GlobalOptions } from "./GlobalOptions.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "../models/SocketTypes.js";

interface ConversationState {
    alreadyInvited?: boolean;
    [key: string]: any;
}

interface ConversationOptions {
    state: ConversationState;
    language: string;
    options: GlobalOptions;
    characters: Character[];
    topic?: string;
}

interface SetupOptions {
    options?: Partial<GlobalOptions>;
    characters: Character[];
    language: string;
    topic: string;
}

interface IMeetingManager {
    meetingId: number | null; // Corrected to number
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    conversation: ConversationMessage[];
    conversationOptions: ConversationOptions;
    handRaised: boolean;
    isPaused: boolean;
    startLoop: () => void;
    dialogGenerator: any;
    audioSystem: any;
    services: any;
    environment: string;
    run: boolean;
    meetingDate: Date | null;
    extraMessageCount: number;
    currentSpeaker: number;
    globalOptions: GlobalOptions;
}

interface WrapUpMessage {
    date: string;
}

/**
 * Manages the high-level lifecycle of a meeting: Start, Wrap-Up, and Continuation.
 * Handles initialization of session state, emitting lifecycle events, and managing the End-of-Meeting summary flow.
 */
export class MeetingLifecycleHandler {
    manager: IMeetingManager;

    constructor(meetingManager: IMeetingManager) {
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

        manager.socket.emit("meeting_started", { meeting_id: manager.meetingId });
        Logger.info(`session ${manager.socket.id}`, `meeting ${manager.meetingId} started`);
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
            manager.socket
        );

        let summary: any = { // Using any for summary structure until fully defined
            id: id,
            speaker: manager.conversationOptions.characters[0].id,
            text: response,
            type: "summary",
        };

        manager.conversation.push(summary);

        manager.socket.emit("conversation_update", manager.conversation);
        Logger.info(`meeting ${manager.meetingId}`, `summary generated on index ${manager.conversation.length - 1}`);

        if (manager.meetingId !== null) {
            manager.services.meetingsCollection.updateOne(
                { _id: manager.meetingId },
                { $set: { conversation: manager.conversation, summary: summary } }
            );
        }

        summary.sentences = splitSentences(response);
        if (manager.meetingId !== null) {
            await manager.audioSystem.generateAudio(
                summary,
                manager.conversationOptions.characters[0],
                manager.conversationOptions.options,
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
            const response = await fetch(
                "https://api.openai.com/v1/realtime/client_secrets",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${openai.apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: sessionConfig,
                }
            );

            const data = await response.json();
            manager.socket.emit("clientkey_response", data);
            Logger.info(`meeting ${manager.meetingId}`, "clientkey sent");
        } catch (error) {
            // console.log(error);
            Logger.error(`meeting ${manager.meetingId}`, "Meeting Lifecycle Error", error);
            reportError(`meeting ${manager.meetingId}`, "Meeting Lifecycle Error", error);
            manager.socket.emit(
                "conversation_error",
                {
                    message: "An error occurred during the conversation.",
                    code: 500
                }
            );
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
}
