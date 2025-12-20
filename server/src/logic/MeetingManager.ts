import type { IMeetingManager, Services, ConversationOptions, IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import { ZodSchema } from "zod";
import type { Character, ConversationMessage } from "@shared/ModelTypes.js";
import type { ClientToServerEvents, ReconnectionOptions, ServerToClientEvents, SetupOptions } from "@shared/SocketTypes.js";

import { getOpenAI } from "@services/OpenAIService.js";
import { meetingsCollection, audioCollection, insertMeeting } from "@services/DbService.js";
import { reportError, reportWarning } from "@utils/errorbot.js";
import { AudioSystem, Message as AudioMessage } from "@logic/AudioSystem.js";
import { SpeakerSelector } from "@logic/SpeakerSelector.js";
import { DialogGenerator } from "@logic/DialogGenerator.js";
import { HumanInputHandler } from "@logic/HumanInputHandler.js";
import { HandRaisingHandler } from "@logic/HandRaisingHandler.js";
import { MeetingLifecycleHandler } from "@logic/MeetingLifecycleHandler.js";
import { ConnectionHandler } from "@logic/ConnectionHandler.js";
import { GlobalOptions, getGlobalOptions } from "@logic/GlobalOptions.js";
import { Socket } from "socket.io";
import { SocketBroadcaster } from "@logic/SocketBroadcaster.js";
import { Logger } from "@utils/Logger.js";
import {
    SetupOptionsSchema,
    HumanMessageSchema,
    InjectionMessageSchema,
    HandRaisedOptionsSchema,
    ReconnectionOptionsSchema,
    WrapUpMessageSchema
} from "@models/ValidationSchemas.js";


interface Decision {
    type: 'END_CONVERSATION' | 'WAIT' | 'REQUEST_PANELIST' | 'GENERATE_AI_RESPONSE';
    speaker?: Character;
}

/**
 * Manages the lifecycle of a single council meeting (session).
 * Orchestrates interaction between Client (Socket.IO), Database, and AI services.
 */
export class MeetingManager implements IMeetingManager {
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    environment: string;
    globalOptions: GlobalOptions;
    services: Services;
    broadcaster: IMeetingBroadcaster;

    run: boolean;
    handRaised: boolean;
    isPaused: boolean;
    currentSpeaker: number;
    extraMessageCount: number;
    meetingId: number | null;
    meetingDate: Date | null;

    audioSystem: AudioSystem;
    dialogGenerator: DialogGenerator;
    humanInputHandler: HumanInputHandler;
    handRaisingHandler: HandRaisingHandler;
    meetingLifecycleHandler: MeetingLifecycleHandler;
    connectionHandler: ConnectionHandler;

    conversation: ConversationMessage[];
    conversationOptions: ConversationOptions;

    constructor(socket: Socket<ClientToServerEvents, ServerToClientEvents>, environment: string, optionsOverride: GlobalOptions | null = null, services: Partial<Services> = {}) {
        this.socket = socket;
        this.broadcaster = new SocketBroadcaster(socket);
        this.environment = environment;
        this.globalOptions = optionsOverride || getGlobalOptions();

        // Default Services
        this.services = {
            meetingsCollection: services.meetingsCollection || meetingsCollection,
            audioCollection: services.audioCollection || audioCollection,
            insertMeeting: services.insertMeeting || insertMeeting,
            getOpenAI: services.getOpenAI || getOpenAI
        };

        // Session variables
        this.run = true;
        this.handRaised = false;
        this.isPaused = false;
        this.currentSpeaker = 0;
        this.extraMessageCount = 0;
        this.meetingId = null;
        this.meetingDate = null;

        this.conversation = [];
        this.conversationOptions = {
            topic: "",
            characters: [] as Character[],
            options: this.globalOptions,
            language: "en"
        };

        this.startLoop = this.startLoop.bind(this);

        this.audioSystem = new AudioSystem(this.broadcaster, this.services, this.globalOptions.audioConcurrency);
        this.dialogGenerator = new DialogGenerator(this.services, this.globalOptions);
        this.humanInputHandler = new HumanInputHandler(this);
        this.handRaisingHandler = new HandRaisingHandler(this);
        this.meetingLifecycleHandler = new MeetingLifecycleHandler(this);
        this.connectionHandler = new ConnectionHandler(this);

        // setupListeners removed. Initialization via SocketManager.

    }



    // NOTE: Listeners are now managed by SocketManager forwarding logic.
    // We keep helper methods, but we don't attach listeners directly anymore.

    /**
     * Called by SocketManager when this session is destroyed (user disconnected or switched meeting).
     */
    destroy() {
        Logger.info(`meeting ${this.meetingId}`, "Session destroyed");
        this.run = false;
        // Clean up listeners? No, we don't attach them anymore.
        // Stop audio generation?
        // Note: AudioSystem might still be processing. Ideally we'd cancel it.
        // Ensure connection handler knows we are done (logging mainly)
        this.connectionHandler.handleDisconnect();
    }

    /**
     * Proxied event handler from SocketManager.
     */
    async handleEvent<K extends keyof ClientToServerEvents>(event: K, payload: Parameters<ClientToServerEvents[K]>[0]) {
        switch (event) {
            case "submit_human_message":
                await this.humanInputHandler.handleSubmitHumanMessage(HumanMessageSchema.parse(payload));
                break;
            case "submit_human_panelist":
                await this.humanInputHandler.handleSubmitHumanPanelist(HumanMessageSchema.parse(payload));
                break;
            case "submit_injection":
                await this.humanInputHandler.handleSubmitInjection(InjectionMessageSchema.parse(payload));
                break;
            case "raise_hand":
                await this.handRaisingHandler.handleRaiseHand(HandRaisedOptionsSchema.parse(payload));
                break;
            case "wrap_up_meeting":
                await this.meetingLifecycleHandler.handleWrapUpMeeting(WrapUpMessageSchema.parse(payload));
                break;
            case "continue_conversation":
                await this.meetingLifecycleHandler.handleContinueConversation();
                break;
            case "request_clientkey":
                await this.meetingLifecycleHandler.handleRequestClientKey();
                break;
            // Prototype Listeners
            case "pause_conversation":
                if (this.environment === 'prototype') await this.meetingLifecycleHandler.handlePauseConversation();
                break;
            case "resume_conversation":
                if (this.environment === 'prototype') await this.meetingLifecycleHandler.handleResumeConversation();
                break;
            case "remove_last_message":
                if (this.environment === 'prototype') await this.meetingLifecycleHandler.handleRemoveLastMessage();
                break;
            default:
                Logger.warn("MeetingManager", `Unhandled event: ${event}`);
        }
    }

    async initializeStart(payload: SetupOptions) {
        const parse = SetupOptionsSchema.safeParse(payload);
        if (!parse.success) {
            this.broadcaster.broadcastWarning("Invalid start options", 400, parse.error);
            return;
        }
        await this.meetingLifecycleHandler.handleStartConversation(parse.data);
    }

    async initializeReconnect(payload: ReconnectionOptions) {
        const parse = ReconnectionOptionsSchema.safeParse(payload);
        if (!parse.success) {
            this.broadcaster.broadcastWarning("Invalid reconnection options", 400, parse.error);
            return;
        }
        await this.connectionHandler.handleReconnection(parse.data);
    }

    async syncClient() {
        if (this.meetingId) {
            this.connectionHandler.handleReconnection({ meetingId: this.meetingId });
            // Note: handleReconnection includes broadcasting update.
        }
    }

    // Legacy method - remove when verification complete.
    // private respondTo...



    async runLoop() {
        while (this.run) {

            // Calculate next step
            const action = this.decideNextAction();

            try {
                // Do it
                await this.processTurn(action);
            } catch (error: unknown) {
                // This might lead to problems if connections reset, disabling for now

                // const err = error as { code?: number, message?: string };
                // if (
                //     err.code === 11600 ||
                //     (err.message && (err.message.includes('interrupted at shutdown') || err.message.includes('ECONNRESET')))
                // ) {
                //     Logger.error(`meeting ${this.meetingId}`, "Error during conversation", error);
                //     return;
                // }

                this.broadcaster.broadcastError("Conversation process error", 500);
                reportError(`meeting ${this.meetingId}`, "Conversation process error", error);
                return;
            }

            // Break after certain actions
            if (action.type === 'WAIT' || action.type === 'END_CONVERSATION') {
                return;
            }
        }
    }

    startLoop() {
        //Will run async
        this.runLoop();
    }

    decideNextAction(): Decision {
        // 0. Just wait
        if (this.isPaused || this.handRaised) {
            return { type: 'WAIT' };
        }
        // 1. Check Limits
        if (this.conversation.length >= this.conversationOptions.options.conversationMaxLength + this.extraMessageCount) {
            return { type: 'END_CONVERSATION' };
        }

        // 2. Check Awaiting States
        if (this.conversation.length > 0) {
            const lastMsg = this.conversation[this.conversation.length - 1];
            if (lastMsg.type === 'awaiting_human_panelist' || lastMsg.type === 'awaiting_human_question') {
                return { type: 'WAIT' };
            }
        }

        // 3. Determine Speaker
        const nextSpeakerIndex = SpeakerSelector.calculateNextSpeaker(this.conversation, this.conversationOptions.characters);
        const nextSpeaker = this.conversationOptions.characters[nextSpeakerIndex];

        // 4. Panelist Turn
        if (nextSpeaker.type === 'panelist') {
            return { type: 'REQUEST_PANELIST', speaker: nextSpeaker };
        }

        // 5. AI Turn
        return { type: 'GENERATE_AI_RESPONSE', speaker: nextSpeaker };
    }

    /**
     * Core loop function. Decides the next action based on conversation state.
     */
    async processTurn(action: Decision): Promise<void> {
        switch (action.type) {
            case 'WAIT':
                return; // Do nothing, just wait.

            case 'END_CONVERSATION':
                this.broadcaster.broadcastConversationEnd();
                return;

            case 'REQUEST_PANELIST':
                if (action.speaker) {
                    this.conversation.push({
                        type: 'awaiting_human_panelist',
                        speaker: action.speaker.id,
                        text: "", // Added to satisfy ConversationMessage
                        sentences: [] // Added to satisfy ConversationMessage
                    });
                    Logger.info(`meeting ${this.meetingId}`, `awaiting human panelist on index ${this.conversation.length - 1}`);
                    this.broadcaster.broadcastConversationUpdate(this.conversation);
                    if (this.meetingId !== null) {
                        this.services.meetingsCollection.updateOne(
                            { _id: this.meetingId },
                            { $set: { conversation: this.conversation } }
                        );
                    }
                }
                return;

            case 'GENERATE_AI_RESPONSE':
                if (action.speaker) {
                    await this.handleAITurn(action as { type: string, speaker: Character });
                }
                break;
        }
    }

    async handleAITurn(action: { type: string, speaker: Character }): Promise<void> {
        this.currentSpeaker = this.conversationOptions.characters.findIndex(c => c.id === action.speaker.id);
        const thisMeetingId = this.meetingId;

        // Generate Logic
        // Check for interrupts function
        const shouldAbort = () => {
            return !this.run || this.handRaised || this.isPaused || thisMeetingId != this.meetingId;
        }

        const output = await this.dialogGenerator.generateResponseWithRetry(
            action.speaker,
            this.conversation,
            this.conversationOptions,
            this.currentSpeaker,
            shouldAbort,
            `meeting ${this.meetingId}`
        );

        if (shouldAbort()) return;

        let message: ConversationMessage = {
            id: output.id || "",
            speaker: action.speaker.id,
            text: output.response,
            sentences: output.sentences || [],
            trimmed: output.trimmed,
            pretrimmed: output.pretrimmed,
            type: "assistant" // Default
        };

        if (this.conversation.length > 1 && this.conversation[this.conversation.length - 1].type === "human" && this.conversation[this.conversation.length - 1].askParticular === message.speaker) {
            message.type = "response";
        }

        if (message.text === "") {
            message.type = "skipped";
            Logger.warn(`meeting ${this.meetingId}`, `failed to make a message. Skipping speaker ${action.speaker.id}`);
        }

        this.conversation.push(message);
        const message_index = this.conversation.length - 1;

        // Save to DB *before* emitting to ensure consistency
        if (this.meetingId !== null) {
            await this.services.meetingsCollection.updateOne(
                { _id: this.meetingId },
                { $set: { conversation: this.conversation } }
            );
        }

        this.broadcaster.broadcastConversationUpdate(this.conversation);
        Logger.info(`meeting ${this.meetingId}`, `message generated, index ${message_index}, speaker ${message.speaker}`);

        // Queue audio generation
        this.audioSystem.queueAudioGeneration(
            message as AudioMessage,
            action.speaker,
            this.conversationOptions.options,
            this.meetingId!,
            this.environment
        );
    }
}





