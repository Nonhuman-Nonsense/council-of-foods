import type { IMeetingManager, Services, IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { Character, Message } from "@shared/ModelTypes.js";
import type { ClientToServerEvents, ReconnectionOptions, ServerToClientEvents, SetupOptions } from "@shared/SocketTypes.js";

import { getOpenAI } from "@services/OpenAIService.js";
import { createConversationService } from "@services/ConversationService.js";
import { meetingsCollection, audioCollection, insertMeeting } from "@services/DbService.js";
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
import type { StoredMeeting } from "@models/DBModels.js";
import {
    SetupOptionsSchema,
    SubmitHumanMessageSchema,
    SubmitHumanPanelistSchema,
    InjectionMessageSchema,
    HandRaisedOptionsSchema,
    ReconnectionOptionsSchema,
    ReportMaximumPlayedIndexSchema,
    WrapUpMessageSchema
} from "@models/ValidationSchemas.js";
import { socketHoldsLiveSession } from "@logic/liveSessionRegistry.js";

/** How many message indices beyond `maximumPlayedIndex` the server may generate before waiting for client playback progress. */
const PLAYBACK_AHEAD_BUFFER = 3;

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
    serverOptions: GlobalOptions;
    services: Services;
    broadcaster: IMeetingBroadcaster;

    meeting: StoredMeeting | null;

    isLoopActive: boolean;
    handRaised: boolean;
    isPaused: boolean;
    currentSpeaker: number;
    private isConversationTransitionActive: boolean;
    private conversationTransitionQueue: Promise<void>;
    private pendingLoopStart: boolean;

    audioSystem: AudioSystem;
    dialogGenerator: DialogGenerator;
    humanInputHandler: HumanInputHandler;
    handRaisingHandler: HandRaisingHandler;
    meetingLifecycleHandler: MeetingLifecycleHandler;
    connectionHandler: ConnectionHandler;

    constructor(socket: Socket<ClientToServerEvents, ServerToClientEvents>, environment: string, serverOptions: GlobalOptions | null = null, services: Partial<Services> = {}) {
        this.socket = socket;
        this.broadcaster = new SocketBroadcaster(socket);
        this.environment = environment;
        this.serverOptions = serverOptions || getGlobalOptions();
        const openAIGetter = services.getOpenAI || getOpenAI;

        // Default Services
        this.services = {
            meetingsCollection: services.meetingsCollection || meetingsCollection,
            audioCollection: services.audioCollection || audioCollection,
            insertMeeting: services.insertMeeting || insertMeeting,
            getOpenAI: openAIGetter,
            // Use a live getter so tests can still spy on getOpenAI after manager construction.
            conversationService: services.conversationService || createConversationService(() => this.services.getOpenAI())
        };

        this.meeting = null;

        // Session variables
        this.isLoopActive = false; // Start inactive, explicit start required
        this.handRaised = false;
        this.isPaused = false;
        this.currentSpeaker = 0;
        this.isConversationTransitionActive = false;
        this.conversationTransitionQueue = Promise.resolve();
        this.pendingLoopStart = false;

        this.startLoop = this.startLoop.bind(this);

        this.audioSystem = new AudioSystem(this.broadcaster, this.services, this.serverOptions.audioConcurrency);
        this.dialogGenerator = new DialogGenerator(this.services, this.serverOptions);
        this.humanInputHandler = new HumanInputHandler(this);
        this.handRaisingHandler = new HandRaisingHandler(this);
        this.meetingLifecycleHandler = new MeetingLifecycleHandler(this);
        this.connectionHandler = new ConnectionHandler(this);
    }

    /**
     * Called by SocketManager when this session is destroyed (user disconnected or switched meeting).
     */
    async destroy(audioStrategy: "drain" | "cancel" = "drain") {
        Logger.info(`meeting ${this.meeting?._id}`, "Session destroyed");
        this.isLoopActive = false;
        if (audioStrategy === "cancel") {
            this.audioSystem.cancelPendingWork();
        } else {
            await this.audioSystem.waitForIdle();
        }
        // Ensure connection handler knows we are done (logging mainly)
        this.connectionHandler.handleDisconnect();
    }

    /**
     * Proxied event handler from SocketManager.
     */
    async handleEvent<K extends keyof ClientToServerEvents>(event: K, payload: Parameters<ClientToServerEvents[K]>[0]) {
        switch (event) {
            case "submit_human_message":
                await this.withConversationTransition(() =>
                    this.humanInputHandler.handleSubmitHumanMessage(SubmitHumanMessageSchema.parse(payload))
                );
                break;
            case "submit_human_panelist":
                await this.withConversationTransition(() =>
                    this.humanInputHandler.handleSubmitHumanPanelist(SubmitHumanPanelistSchema.parse(payload))
                );
                break;
            case "submit_injection":
                await this.withConversationTransition(() =>
                    this.humanInputHandler.handleSubmitInjection(InjectionMessageSchema.parse(payload))
                );
                break;
            case "raise_hand":
                await this.withConversationTransition(() =>
                    this.handRaisingHandler.handleRaiseHand(HandRaisedOptionsSchema.parse(payload))
                );
                break;
            case "wrap_up_meeting":
                await this.withConversationTransition(() =>
                    this.meetingLifecycleHandler.handleWrapUpMeeting(WrapUpMessageSchema.parse(payload))
                );
                break;
            case "continue_conversation":
                await this.withConversationTransition(() =>
                    this.meetingLifecycleHandler.handleContinueConversation()
                );
                break;
            case "report_maximum_played_index":
                await this.handleReportMaximumPlayedIndex(payload);
                break;
            // Prototype Listeners
            case "pause_conversation":
                if (this.environment === 'prototype') await this.meetingLifecycleHandler.handlePauseConversation();
                break;
            case "resume_conversation":
                if (this.environment === 'prototype') await this.meetingLifecycleHandler.handleResumeConversation();
                break;
            case "remove_last_message":
                if (this.environment === 'prototype') {
                    await this.withConversationTransition(() =>
                        Promise.resolve(this.meetingLifecycleHandler.handleRemoveLastMessage())
                    );
                }
                break;
            default:
                Logger.warn("MeetingManager", `Unhandled event: ${event}`);
        }
    }

    private async withConversationTransition<T>(operation: () => Promise<T>): Promise<T> {
        const run = async (): Promise<T> => {
            this.isConversationTransitionActive = true;
            try {
                return await operation();
            } finally {
                this.isConversationTransitionActive = false;
                if (this.pendingLoopStart) {
                    this.pendingLoopStart = false;
                    this.startLoop();
                }
            }
        };

        const result = this.conversationTransitionQueue.then(run, run);
        this.conversationTransitionQueue = result.then(
            () => undefined,
            () => undefined
        );

        return result;
    }

    /**
     * Live session only: monotonic progress for replay cap (`maximumPlayedIndex` on meeting doc).
     */
    private async handleReportMaximumPlayedIndex(payload: unknown): Promise<void> {
        const { index } = ReportMaximumPlayedIndexSchema.parse(payload);
        const meeting = this.meeting;
        if (!meeting) {
            Logger.warn("PlaybackProgress", "report_maximum_played_index ignored: no active meeting");
            return;
        }
        if (!socketHoldsLiveSession(meeting._id, this.socket.id)) {
            Logger.warn(`meeting ${meeting._id}`, `report_maximum_played_index ignored: socket ${this.socket.id} is not the live session holder`);
            return;
        }
        const conv = meeting.conversation ?? [];
        if (conv.length === 0) {
            Logger.warn(`meeting ${meeting._id}`, "report_maximum_played_index ignored: empty conversation");
            return;
        }
        const maxValid = conv.length - 1;
        if (index < 0 || index > maxValid) {
            Logger.info(`meeting ${meeting._id}`, `report_maximum_played_index ignored: index ${index} out of range 0..${maxValid}`);
            return;
        }
        await this.services.meetingsCollection.updateOne(
            { _id: meeting._id },
            { $max: { maximumPlayedIndex: index } }
        );

        const prevLocal = meeting.maximumPlayedIndex;
        meeting.maximumPlayedIndex =
            prevLocal == null ? index : Math.max(prevLocal, index);

        this.startLoop();
    }

    async initializeStart(payload: SetupOptions) {
        const data = SetupOptionsSchema.parse(payload);
        await this.meetingLifecycleHandler.handleStartConversation(data);
    }

    async initializeReconnect(payload: ReconnectionOptions): Promise<boolean> {
        const data = ReconnectionOptionsSchema.parse(payload);
        return this.connectionHandler.handleReconnection(data);
    }

    async syncClient() {
        if (this.meeting) {
            await this.connectionHandler.handleReconnection({
                meetingId: this.meeting._id,
                liveKey: this.meeting.liveKey,
            });
        }
    }


    async runLoop() {
        while (this.isLoopActive) {
            const meeting = this.meeting;
            if (!meeting) {
                this.isLoopActive = false;
                return;
            }

            // Calculate next step
            const action = this.decideNextAction();

            // Break after certain actions
            // CRITICAL: We mark the loop as inactive BEFORE calling processTurn.
            // Why? If processTurn yields (awaits), and the user clicks "Resume" immediately, 
            // startLoop() needs to see isLoopActive=false to execute. 
            // If we waited until after processTurn, startLoop() would think the loop is 
            // still running and return early, failing to restart the conversation.
            //
            // We still proceed to processTurn below because 'END_CONVERSATION' needs 
            // to broadcast the end event to clients.
            if (action.type === 'WAIT' || action.type === 'END_CONVERSATION') {
                this.isLoopActive = false;
            }

            try {
                // Do it
                await this.processTurn(action);
            } catch (error: unknown) {
                Logger.reportAndCrashClient(`meeting ${meeting._id}`, "Conversation process error", error, this.broadcaster);
                return;
            }

            if (action.type === 'WAIT' || action.type === 'END_CONVERSATION') {
                return;
            }
        }
        this.isLoopActive = false; // Ensure state is synced if loop breaks naturally
    }

    startLoop() {
        if (this.isConversationTransitionActive) {
            this.pendingLoopStart = true;
            return;
        }
        // Idempotent start
        if (this.isLoopActive) return;
        if (!this.meeting) return;

        // Logger.info(`meeting ${this.meeting._id}`, "loop started");
        this.isLoopActive = true;
        this.runLoop();
    }

    decideNextAction(): Decision {
        const meeting = this.meeting;
        if (!meeting) {
            return { type: 'WAIT' };
        }

        // 0. Just wait
        if (this.isPaused || this.handRaised) {
            return { type: 'WAIT' };
        }
        // 1. Already ended at length cap (synthetic tail)
        if (meeting.conversation.length > 0) {
            const lastMsg = meeting.conversation[meeting.conversation.length - 1];
            if (lastMsg.type === 'max_reached') {
                return { type: 'WAIT' };
            }
        }
        // 2. Check Limits
        if (meeting.conversation.length >= this.serverOptions.meetingVeryMaxLength || meeting.conversation.length >= this.serverOptions.conversationMaxLength + meeting.conversationExtraSlots) {
            return { type: 'END_CONVERSATION' };
        }

        // 2b. Live playback: do not get more than `PLAYBACK_AHEAD_BUFFER` messages ahead of what the client has played
        if (meeting.maximumPlayedIndex != null) {
            if (meeting.conversation.length > meeting.maximumPlayedIndex + PLAYBACK_AHEAD_BUFFER) {
                return { type: 'WAIT' };
            }
        }

        // 3. Check Awaiting States
        if (meeting.conversation.length > 0) {
            const lastMsg = meeting.conversation[meeting.conversation.length - 1];
            if (lastMsg.type === 'awaiting_human_panelist' || lastMsg.type === 'awaiting_human_question') {
                return { type: 'WAIT' };
            }
        }

        // 4. Determine Speaker
        const nextSpeakerIndex = SpeakerSelector.calculateNextSpeaker(meeting.conversation, meeting.characters);
        const nextSpeaker = meeting.characters[nextSpeakerIndex];

        // 5. Panelist Turn
        if (nextSpeaker.id.startsWith('panelist')) {
            return { type: 'REQUEST_PANELIST', speaker: nextSpeaker };
        }

        // 6. AI Turn
        return { type: 'GENERATE_AI_RESPONSE', speaker: nextSpeaker };
    }

    /**
     * Core loop function. Decides the next action based on conversation state.
     */
    async processTurn(action: Decision): Promise<void> {
        const meeting = this.meeting;
        if (!meeting) return;

        switch (action.type) {
            case 'WAIT':
                return; // Do nothing, just wait.

            case 'END_CONVERSATION': {
                const currentCap = this.serverOptions.conversationMaxLength + meeting.conversationExtraSlots;
                meeting.conversation.push({ type: 'max_reached', canContinue: currentCap < this.serverOptions.meetingVeryMaxLength, });
                await this.services.meetingsCollection.updateOne(
                    { _id: meeting._id },
                    {$set: {conversation: meeting.conversation}}
                );
                this.broadcaster.broadcastConversationUpdate(meeting.conversation);
                this.broadcaster.broadcastConversationEnd();
                return;
            }

            case 'REQUEST_PANELIST':
                if (action.speaker) {
                    meeting.conversation.push({
                        type: 'awaiting_human_panelist',
                        speaker: action.speaker.id,
                        text: "",
                    });
                    Logger.info(`meeting ${meeting._id}`, `awaiting human panelist on index ${meeting.conversation.length - 1}`);
                    this.broadcaster.broadcastConversationUpdate(meeting.conversation);
                    await this.services.meetingsCollection.updateOne(
                        { _id: meeting._id },
                        { $set: { conversation: meeting.conversation } }
                    );
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
        const meeting = this.meeting;
        if (!meeting) return;

        this.currentSpeaker = meeting.characters.findIndex(c => c.id === action.speaker.id);
        const thisMeetingId = meeting._id;

        // Generate Logic
        // Check for interrupts function
        const shouldAbort = () => {
            return !this.isLoopActive || this.handRaised || this.isPaused || thisMeetingId !== this.meeting?._id;
        }

        const output = await this.dialogGenerator.generateResponseWithRetry(
            action.speaker,
            meeting,
            this.currentSpeaker,
            shouldAbort,
            `meeting ${meeting._id}`
        );

        if (shouldAbort()) return;

        const message: Message = {
            id: output.id || "",
            speaker: action.speaker.id,
            text: output.response,
            sentences: output.sentences || [],
            trimmed: output.trimmed,
            pretrimmed: output.pretrimmed,
            type: "message" // Default
        };

        if (meeting.conversation.length > 1 && meeting.conversation[meeting.conversation.length - 1].type === "human" && meeting.conversation[meeting.conversation.length - 1].askParticular === message.speaker) {
            message.type = "response";
        }

        if (message.text === "") {
            message.type = "skipped";
            Logger.warn(`meeting ${meeting._id}`, `failed to make a message. Skipping speaker ${action.speaker.id}`);
        }

        meeting.conversation.push(message);
        const message_index = meeting.conversation.length - 1;

        // Save to DB *before* emitting to ensure consistency
        await this.services.meetingsCollection.updateOne(
            { _id: meeting._id },
            { $set: { conversation: meeting.conversation } }
        );

        this.broadcaster.broadcastConversationUpdate(meeting.conversation);
        Logger.info(`meeting ${meeting._id}`, `message generated, index ${message_index}, speaker ${message.speaker}`);

        // Queue audio generation
        this.audioSystem.queueAudioGeneration(
            message as AudioMessage,
            action.speaker,
            meeting,
            this.environment,
            this.serverOptions
        );
    }
}
