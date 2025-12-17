import { getOpenAI } from "@services/OpenAIService.js";
import { meetingsCollection, audioCollection, insertMeeting } from "@services/DbService.js";
import { reportError } from "@utils/errorbot.js";

import { AudioSystem } from "@logic/AudioSystem.js";
import { SpeakerSelector } from "@logic/SpeakerSelector.js";
import { DialogGenerator, GPTResponse } from "@logic/DialogGenerator.js";
import { HumanInputHandler } from "@logic/HumanInputHandler.js";
import { HandRaisingHandler } from "@logic/HandRaisingHandler.js";
import { MeetingLifecycleHandler } from "@logic/MeetingLifecycleHandler.js";
import { ConnectionHandler } from "@logic/ConnectionHandler.js";
import { GlobalOptions, getGlobalOptions } from "@logic/GlobalOptions.js";
import { Meeting, Audio } from "@models/DBModels.js";
import { Collection, InsertOneResult } from "mongodb";
import { OpenAI } from "openai";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@shared/SocketTypes.js";
import type { Character, ConversationMessage } from "@shared/ModelTypes.js";
import {
    SetupOptionsSchema,
    HumanMessageSchema,
    InjectionMessageSchema,
    HandRaisedOptionsSchema,
    ReconnectionOptionsSchema
} from "@models/ValidationSchemas.js";

import { Logger } from "@utils/Logger.js";
import { IMeetingManager, Services, ConversationState, ConversationOptions } from "@interfaces/MeetingInterfaces.js";

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

        this.startLoop = this.startLoop.bind(this);
        this.audioSystem = new AudioSystem(this.socket, this.services as any, this.globalOptions.audioConcurrency); // Cast services as AudioSystem expects generic collection for now
        this.dialogGenerator = new DialogGenerator(this.services, this.globalOptions);
        this.humanInputHandler = new HumanInputHandler(this as any);
        this.handRaisingHandler = new HandRaisingHandler(this as any);
        this.meetingLifecycleHandler = new MeetingLifecycleHandler(this as any);
        this.connectionHandler = new ConnectionHandler(this as any);

        this.conversation = [];
        this.conversationOptions = {
            topic: "",
            characters: [] as Character[],
            options: this.globalOptions,
            language: "en"
        };

        this.setupListeners();
    }

    setupListeners() {
        if (this.environment === "prototype") {
            this.setupPrototypeListeners();
        }

        // Use handlers with Zod Validation
        this.socket.on("submit_human_message", (msg) => {
            const parse = HumanMessageSchema.safeParse(msg);
            if (!parse.success) {
                const errorMsg = `Invalid submit_human_message payload: ${JSON.stringify(parse.error.format())}`;
                reportError(`meeting ${this.meetingId}`, errorMsg, parse.error);
                return;
            }
            this.humanInputHandler.handleSubmitHumanMessage(parse.data);
        });

        this.socket.on("submit_human_panelist", (msg) => {
            const parse = HumanMessageSchema.safeParse(msg);
            if (!parse.success) {
                const errorMsg = `Invalid submit_human_panelist payload: ${JSON.stringify(parse.error.format())}`;
                reportError(`meeting ${this.meetingId}`, errorMsg, parse.error);
                return;
            }
            this.humanInputHandler.handleSubmitHumanPanelist(parse.data);
        });

        this.socket.on("submit_injection", (msg) => {
            const parse = InjectionMessageSchema.safeParse(msg);
            if (!parse.success) {
                const errorMsg = `Invalid submit_injection payload: ${JSON.stringify(parse.error.format())}`;
                reportError(`meeting ${this.meetingId}`, errorMsg, parse.error);
                return;
            }
            this.humanInputHandler.handleSubmitInjection(parse.data);
        });

        this.socket.on("raise_hand", (msg) => {
            const parse = HandRaisedOptionsSchema.safeParse(msg);
            if (!parse.success) {
                const errorMsg = `Invalid raise_hand payload: ${JSON.stringify(parse.error.format())}`;
                reportError(`meeting ${this.meetingId}`, errorMsg, parse.error);
                return;
            }
            this.handRaisingHandler.handleRaiseHand(parse.data);
        });

        this.socket.on("wrap_up_meeting", (msg) => {
            // Basic object check till we define strict schema for this one
            if (!msg || typeof msg !== 'object') return Logger.error(`meeting ${this.meetingId}`, "Invalid wrap_up_meeting payload");
            this.meetingLifecycleHandler.handleWrapUpMeeting(msg);
        });

        this.socket.on('attempt_reconnection', (options) => {
            const parse = ReconnectionOptionsSchema.safeParse(options);
            if (!parse.success) {
                const errorMsg = `Invalid attempt_reconnection payload: ${JSON.stringify(parse.error.format())}`;
                // This doesn't have a specific meeting context yet from 'this', use options.meetingId
                reportError(`meeting ${options.meetingId}`, errorMsg, parse.error);
                return;
            }
            this.connectionHandler.handleReconnection(parse.data);
        });

        this.socket.on("start_conversation", async (setup) => {
            const parse = SetupOptionsSchema.safeParse(setup);
            if (!parse.success) {
                const errorMsg = `Invalid start_conversation payload: ${JSON.stringify(parse.error.format())}`;
                reportError("init", errorMsg, parse.error);
                return;
            }
            this.meetingLifecycleHandler.handleStartConversation(parse.data);
        });

        this.socket.on("disconnect", () => this.connectionHandler.handleDisconnect());

        this.socket.on('continue_conversation', () => this.meetingLifecycleHandler.handleContinueConversation());
        this.socket.on('request_clientkey', async () => this.meetingLifecycleHandler.handleRequestClientKey());
    }

    setupPrototypeListeners() {
        if (this.environment !== 'prototype') return;

        this.socket.on("pause_conversation", (msg: any) => {
            Logger.info(`meeting ${this.meetingId}`, "paused");
            this.isPaused = true;
        });

        this.socket.on("resume_conversation", (msg: any) => {
            Logger.info(`meeting ${this.meetingId}`, "resumed");
            this.isPaused = false;
            this.startLoop();
        });
        this.socket.on("remove_last_message", () => {
            this.conversation.pop();
            this.socket.emit("conversation_update", this.conversation);
        });
    }

    async runLoop() {
        while (this.run) {
            if (this.isPaused || this.handRaised) {
                return;
            }

            // Check max length
            if (this.conversation.length >= this.conversationOptions.options.conversationMaxLength + this.extraMessageCount) {
                return;
            }

            // Check awaiting states
            if (this.conversation.length > 0 &&
                (this.conversation[this.conversation.length - 1].type === 'awaiting_human_panelist' ||
                    this.conversation[this.conversation.length - 1].type === 'awaiting_human_question')) {
                return;
            }

            await this.processTurn();

            // If processTurn resulted in a state change (pause, hand raise, end), the next iteration check handles it (or we return).
        }
    }

    startLoop() {
        this.runLoop();
    }

    decideNextAction(): Decision {
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
    async processTurn(): Promise<void> {
        try {
            const thisMeetingId = this.meetingId;

            // Decoupled Decision Step
            const action = this.decideNextAction();

            switch (action.type) {
                case 'WAIT':
                    return; // Do nothing, just wait.

                case 'END_CONVERSATION':
                    this.socket.emit("conversation_end", this.conversation);
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
                        this.socket.emit("conversation_update", this.conversation);
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
        } catch (error: any) {
            // Suppress "interrupted at shutdown" and ECONNRESET errors often seen during tests
            if (
                error.code === 11600 ||
                (error.message && (error.message.includes('interrupted at shutdown') || error.message.includes('ECONNRESET')))
            ) {
                return;
            }
            Logger.error(`meeting ${this.meetingId}`, "Error during conversation", error);
            this.socket.emit("conversation_error", { message: "Error", code: 500 });
            reportError(`meeting ${this.meetingId}`, "Conversation process error", error);
        }
    }

    async handleAITurn(action: { type: string, speaker: Character }): Promise<void> {
        this.currentSpeaker = this.conversationOptions.characters.findIndex(c => c.id === action.speaker.id);
        const thisMeetingId = this.meetingId;

        // Generate Logic
        let attempt = 1;
        let output: GPTResponse = {
            response: "",
            id: null,
            sentences: [],
            trimmed: undefined,
            pretrimmed: undefined
        };
        while (attempt < 5 && output.response === "") {
            output = await this.dialogGenerator.generateTextFromGPT(
                action.speaker,
                this.conversation,
                this.conversationOptions,
                this.currentSpeaker
            );

            if (!this.run || this.handRaised || this.isPaused) return;
            if (thisMeetingId != this.meetingId) return;
            attempt++;
            if (output.response === "") {
                Logger.info(`meeting ${this.meetingId}`, `entire message trimmed, trying again. attempt ${attempt}`);
            }
        }

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

        this.socket.emit("conversation_update", this.conversation);
        Logger.info(`meeting ${this.meetingId}`, `message generated, index ${message_index}, speaker ${message.speaker}`);

        // Queue audio generation
        this.audioSystem.queueAudioGeneration(
            message as any,
            action.speaker as any,
            this.conversationOptions.options,
            this.meetingId!,
            this.environment
        );
    }
}





