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
import { annotateDirectedHandoff } from "@logic/directedHandoff.js";
import { SpeakerTargetClassifier } from "@logic/SpeakerTargetClassifier.js";
import { HandRaisingHandler } from "@logic/HandRaisingHandler.js";
import { MeetingLifecycleHandler } from "@logic/MeetingLifecycleHandler.js";
import { ConnectionHandler } from "@logic/ConnectionHandler.js";
import { GlobalOptions, getGlobalOptions } from "@logic/GlobalOptions.js";
import { Socket } from "socket.io";
import { SocketBroadcaster } from "@logic/SocketBroadcaster.js";
import { Logger } from "@utils/Logger.js";
import { splitSentences } from "@shared/textUtils.js";
import type { StoredMeeting } from "@models/DBModels.js";
import {
    SetupOptionsSchema,
    SubmitHumanMessageSchema,
    SubmitHumanPanelistSchema,
    HandRaisedOptionsSchema,
    ReconnectionOptionsSchema,
    ReportMaximumPlayedIndexSchema,
    ConcludeMeetingMessageSchema
} from "@models/ValidationSchemas.js";
import { socketHoldsLiveSession } from "@logic/liveSessionRegistry.js";

/** How many message indices beyond `maximumPlayedIndex` the server may generate before waiting for client playback progress. */
const PLAYBACK_AHEAD_BUFFER = 3;

/**
 * Absolute, hardcoded ceiling on conversation length — deliberately NOT derived from
 * `serverOptions.meetingVeryMaxLength`. Any healthy meeting (even a generously configured one,
 * or a prototype session where the client can override serverOptions) stays far below this: the
 * server-decided cap plus the closing line + summary the auto-conclude sequence appends on top
 * of it. If the conversation ever grows past this fixed number, something has gone badly wrong
 * (e.g. duplicated/runaway progression) and the loop hard-stops — a value that depended on
 * configuration could itself be misconfigured (or, in prototype mode, overridden by the client)
 * and silently raise the ceiling along with it, which defeats the point of a circuit breaker.
 * See the check in `runLoop`.
 */
export const ABSOLUTE_MAX_CONVERSATION_LENGTH = 35;

interface Decision {
    type: 'QUERY_EXTENSION' | 'CONCLUDE_MEETING' | 'GENERATE_SUMMARY' | 'IDLE' | 'REQUEST_PANELIST' | 'GENERATE_AI_RESPONSE';
    speaker?: Character;
}

function stopsConversationLoop(action: Decision): boolean {
    // Note: CONCLUDE_MEETING and GENERATE_SUMMARY are NOT terminal. Concluding pushes the
    // closing line + a `summary_pending` marker; the loop must keep running so the next
    // iteration picks up that marker (→ GENERATE_SUMMARY) and produces the summary, after
    // which the tail becomes a real `summary` and rule 1 of decideNextAction returns IDLE.
    return action.type === 'IDLE'
        || action.type === 'QUERY_EXTENSION';
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

    /**
     * Session liveness. True from construction until `destroy()` / disconnect tears the
     * session down. Checked by the run loop's `while` and by in-flight generation
     * (`shouldAbort`) so teardown promptly aborts work. This is NOT a "loop is running"
     * flag — that role belongs to `loopRunning`.
     */
    isActive: boolean;
    /**
     * True only while `runLoop()` is executing. Owned exclusively by `runLoop` (set on
     * entry, cleared in its `finally`). The sole guard preventing two concurrent loops,
     * which is what makes duplicate concludes / runaway generation structurally impossible.
     */
    loopRunning: boolean;
    /**
     * Latch set by every `startLoop()` call and consumed by `runLoop()`. Guarantees a
     * wake-up that arrives while the loop is finishing a terminal turn is never lost (the
     * frequent `report_maximum_played_index` pings depend on this to avoid stranding
     * generation mid-meeting).
     */
    wakeRequested: boolean;
    handRaised: boolean;
    isPaused: boolean;
    currentSpeaker: number;
    lastReconnectionAt?: number;
    private isConversationTransitionActive: boolean;
    private conversationTransitionQueue: Promise<void>;
    private pendingLoopStart: boolean;

    audioSystem: AudioSystem;
    dialogGenerator: DialogGenerator;
    humanInputHandler: HumanInputHandler;
    speakerTargetClassifier: SpeakerTargetClassifier;
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
        // The session starts alive but idle: no loop runs until startLoop() is called.
        this.isActive = true;
        this.loopRunning = false;
        this.wakeRequested = false;
        this.handRaised = false;
        this.isPaused = false;
        this.currentSpeaker = 0;
        this.isConversationTransitionActive = false;
        this.conversationTransitionQueue = Promise.resolve();
        this.pendingLoopStart = false;

        this.startLoop = this.startLoop.bind(this);

        this.audioSystem = new AudioSystem(this.broadcaster, this.services, this.serverOptions.audioConcurrency, this);
        this.dialogGenerator = new DialogGenerator(this.services, this.serverOptions);
        this.speakerTargetClassifier = new SpeakerTargetClassifier(this.serverOptions);
        this.humanInputHandler = new HumanInputHandler(this);
        this.handRaisingHandler = new HandRaisingHandler(this);
        this.meetingLifecycleHandler = new MeetingLifecycleHandler(this);
        this.connectionHandler = new ConnectionHandler(this);
    }

    getReportContext(): { meetingId?: number; socketId?: string } {
        return {
            meetingId: this.meeting?._id,
            socketId: this.socket.id,
        };
    }

    /**
     * Called by SocketManager when this session is destroyed (user disconnected or switched meeting).
     */
    async destroy(audioStrategy: "drain" | "cancel" = "drain") {
        Logger.info(`meeting ${this.meeting?._id}`, "Session destroyed");
        // Kill the session: stops the run loop at its next iteration boundary and aborts
        // any in-flight generation (AI turn / conclude) via shouldAbort / stale checks.
        this.isActive = false;
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
            case "skip_human_turn":
                await this.withConversationTransition(() =>
                    this.humanInputHandler.handleSkipHumanTurn()
                );
                break;
            case "raise_hand":
                await this.withConversationTransition(() =>
                    this.handRaisingHandler.handleRaiseHand(HandRaisedOptionsSchema.parse(payload))
                );
                break;
            case "conclude_meeting":
                await this.withConversationTransition(() =>
                    this.meetingLifecycleHandler.handleConcludeMeeting(ConcludeMeetingMessageSchema.parse(payload))
                );
                break;
            case "extend_meeting":
                await this.withConversationTransition(() =>
                    this.meetingLifecycleHandler.handleExtendMeeting()
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
            default:
                Logger.warn("MeetingManager", `Unhandled event: ${event}`, { from: this });
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
            Logger.warn("PlaybackProgress", "report_maximum_played_index ignored: no active meeting", { from: this });
            return;
        }
        if (!socketHoldsLiveSession(meeting._id, this.socket.id)) {
            Logger.warn("meeting", `report_maximum_played_index ignored: socket ${this.socket.id} is not the live session holder`, { from: this });
            return;
        }
        const conv = meeting.conversation ?? [];
        if (conv.length === 0) {
            Logger.warn("meeting", "report_maximum_played_index ignored: empty conversation", { from: this });
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


    /**
     * The single driver of automated conversation progression.
     *
     * Concurrency invariant: at most ONE runLoop executes per manager. `loopRunning` is
     * owned exclusively here (set on entry, cleared in the `finally`) and `startLoop`
     * refuses to launch a second loop while it is true. This is what makes duplicate
     * concludes and runaway generation structurally impossible — the failure mode that
     * previously let a single meeting conclude dozens of times and hammer the TTS provider.
     *
     * Wake invariant: every `startLoop` sets `wakeRequested`. A loop that reaches a terminal
     * action (IDLE / query_extension / conclude) only exits if no wake arrived while it was
     * working; otherwise it re-evaluates. No wake-up is ever lost, so the frequent
     * `report_maximum_played_index` pings can never strand generation mid-meeting.
     */
    async runLoop(): Promise<void> {
        if (this.loopRunning) return; // Belt-and-suspenders; startLoop already guards this.
        this.loopRunning = true;
        try {
            while (this.isActive && this.meeting) {
                // Consume the wake we are acting on. Anything arriving from here on re-sets
                // this flag and is re-checked before the loop exits on a terminal action.
                this.wakeRequested = false;

                // ---- Circuit breaker: hard invariant ----
                // A fixed, config-independent ceiling — see ABSOLUTE_MAX_CONVERSATION_LENGTH.
                // Blowing past it means a runaway — hard-stop and report loudly instead of ever
                // creeping to index 100 again.
                if (this.meeting.conversation.length > ABSOLUTE_MAX_CONVERSATION_LENGTH) {
                    this.isActive = false;
                    Logger.reportAndCrashClient("meeting", "Runaway conversation length; aborting loop", {
                        error: new Error(
                            `conversation length ${this.meeting.conversation.length} exceeded hard ceiling ${ABSOLUTE_MAX_CONVERSATION_LENGTH} (meeting ${this.meeting._id})`
                        ),
                        from: this,
                        broadcaster: this.broadcaster,
                    });
                    return;
                }

                const action = this.decideNextAction();

                try {
                    await this.processTurn(action);
                } catch (error: unknown) {
                    // A process error is terminal for this session: report, kill the session,
                    // and prevent the finally below from re-arming the loop.
                    this.isActive = false;
                    Logger.reportAndCrashClient("meeting", "Conversation process error", {
                        error,
                        from: this,
                        broadcaster: this.broadcaster,
                    });
                    return;
                }

                // A terminal action means "no more work right now" — wait for an external
                // wake (human input, extend, playback progress, reconnect). But if a wake
                // landed while processTurn was awaiting, re-evaluate instead of exiting.
                if (stopsConversationLoop(action) && !this.wakeRequested) {
                    return;
                }
            }
        } finally {
            this.loopRunning = false;
            // A wake that arrived in the tiny gap between the while-condition failing and
            // this finally running must not be dropped — re-arm the loop.
            if (this.wakeRequested && this.isActive && this.meeting) {
                this.startLoop();
            }
        }
    }

    /**
     * Requests the run loop. Idempotent and safe to call from any event handler.
     *
     * Every call latches `wakeRequested` so a wake can never be lost even if it races a loop
     * that is about to exit. At most one loop is ever launched (the `loopRunning` guard).
     */
    startLoop(): void {
        // A socket-driven mutation is in flight; defer until it settles so the loop never
        // reads a half-mutated conversation. withConversationTransition's finally re-invokes us.
        if (this.isConversationTransitionActive) {
            this.pendingLoopStart = true;
            return;
        }
        if (!this.meeting || !this.isActive) return;

        this.wakeRequested = true;
        if (this.loopRunning) return; // A loop is already running; it will observe the wake.

        void this.runLoop();
    }

    decideNextAction(): Decision {
        const meeting = this.meeting;
        if (!meeting) {
            return { type: 'IDLE' };
        }

        // 0a. A concluding meeting always finishes: if the tail is a `summary_pending` marker,
        //     generate the summary NOW — no pause, raised hand, cap, or playback buffer may
        //     block or divert it. This is deliberately the first rule so a stale handRaised/
        //     isPaused (e.g. carried in on reconnect) can never strand the conclusion.
        if (meeting.conversation.length > 0
            && meeting.conversation[meeting.conversation.length - 1].type === 'summary_pending') {
            return { type: 'GENERATE_SUMMARY' };
        }

        // 0. No work while paused or interrupted.
        if (this.isPaused || this.handRaised) {
            return { type: 'IDLE' };
        }
        // 1. Stop if the last message is terminal or we're awaiting human input.
        //    This MUST run before the length-cap check below: a pending human turn
        //    (awaiting_*) plus its chair invitation can push the conversation to the
        //    cap, and we must never end the meeting while waiting for the human.
        if (meeting.conversation.length > 0) {
            const lastMsg = meeting.conversation[meeting.conversation.length - 1];
            if (
                lastMsg.type === 'query_extension' ||
                lastMsg.type === 'summary' ||
                lastMsg.type === 'awaiting_human_panelist' ||
                lastMsg.type === 'awaiting_human_question'
            ) {
                return { type: 'IDLE' };
            }
        }
        // 2. Check Limits
        if (meeting.conversation.length >= this.serverOptions.meetingVeryMaxLength || meeting.conversation.length >= this.serverOptions.conversationMaxLength + meeting.conversationExtraSlots) {
            const currentCap = this.serverOptions.conversationMaxLength + meeting.conversationExtraSlots;
            const hasRoomToExtend = currentCap < this.serverOptions.meetingVeryMaxLength;
            return { type: hasRoomToExtend ? 'QUERY_EXTENSION' : 'CONCLUDE_MEETING' };
        }

        // 2b. Live playback: do not get more than `PLAYBACK_AHEAD_BUFFER` messages ahead of what the client has played (not in prototype)
        if (this.environment !== 'prototype' && meeting.maximumPlayedIndex != null) {
            if (meeting.conversation.length > meeting.maximumPlayedIndex + PLAYBACK_AHEAD_BUFFER) {
                return { type: 'IDLE' };
            }
        }

        // 3. Determine Speaker
        const nextSpeakerIndex = SpeakerSelector.calculateNextSpeaker(meeting.conversation, meeting.characters, {
            directedSpeakerRouting: this.serverOptions.directedSpeakerRouting,
            chairId: this.serverOptions.chairId,
        });
        const nextSpeaker = meeting.characters[nextSpeakerIndex];

        // 4. Panelist Turn
        if (nextSpeaker.id.startsWith('panelist')) {
            return { type: 'REQUEST_PANELIST', speaker: nextSpeaker };
        }

        // 5. AI Turn
        return { type: 'GENERATE_AI_RESPONSE', speaker: nextSpeaker };
    }

    /**
     * Core loop function. Decides the next action based on conversation state.
     */
    async processTurn(action: Decision): Promise<void> {
        const meeting = this.meeting;
        if (!meeting) return;

        switch (action.type) {
            case 'IDLE':
                return; // Do nothing.

            case 'QUERY_EXTENSION': {
                Logger.info(`meeting ${meeting._id}`, 'conversation soft cap reached, awaiting visitor choice');
                meeting.conversation.push({ type: 'query_extension' });
                await this.services.meetingsCollection.updateOne(
                    { _id: meeting._id },
                    { $set: { conversation: meeting.conversation } }
                );
                this.broadcaster.broadcastConversationUpdate(meeting.conversation);
                this.broadcaster.broadcastConversationEnd();
                return;
            }

            case 'CONCLUDE_MEETING': {
                Logger.info(`meeting ${meeting._id}`, 'hard cap reached, auto conclude meeting');
                const date = new Date().toISOString().slice(0, 10);
                await this.meetingLifecycleHandler.handleConcludeMeeting({ date });
                return;
            }

            case 'GENERATE_SUMMARY': {
                // The tail is a `summary_pending` marker (from handleConcludeMeeting). Generate
                // the summary and replace the marker in place with the real `summary` message.
                const date = new Date().toISOString().slice(0, 10);
                await this.meetingLifecycleHandler.generateSummary({ date });
                return;
            }

            case 'REQUEST_PANELIST':
                if (action.speaker) {
                    const panelistId = action.speaker.id;
                    const isFirstPanelistTurn = !meeting.conversation.some(
                        (msg) =>
                            msg.speaker === panelistId &&
                            (msg.type === "panelist" || msg.type === "skipped")
                    );

                    if (isFirstPanelistTurn) {
                        const panelistName = action.speaker.name || "Human";
                        const invitationIndex = meeting.conversation.length;
                        const chairInterjection = await this.dialogGenerator.chairInterjection(
                            this.serverOptions.panelistInvitationPrompt[meeting.language].replace(
                                "[NAME]",
                                panelistName
                            ),
                            invitationIndex,
                            this.serverOptions.panelistInvitationLength,
                            meeting,
                            this.broadcaster
                        );

                        const {
                            response,
                            id,
                            trimmed,
                            pretrimmed,
                            sentences,
                        } = chairInterjection;

                        const invitation: Message = {
                            id: id as string,
                            speaker: meeting.characters[0].id,
                            text: response,
                            type: "invitation",
                            sentences: sentences || splitSentences(response),
                            trimmed,
                            pretrimmed,
                        };

                        meeting.conversation.push(invitation);
                        Logger.info(`meeting ${meeting._id}`, `panelist invitation generated for ${panelistId} on index ${invitationIndex}`);

                        this.audioSystem.queueAudioGeneration(
                            { ...invitation, id: invitation.id as string, text: invitation.text as string, sentences: invitation.sentences! },
                            meeting.characters[0],
                            meeting,
                            this.environment,
                            this.serverOptions
                        );
                    }

                    meeting.conversation.push({
                        type: 'awaiting_human_panelist',
                        speaker: panelistId,
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
            return !this.isActive || this.handRaised || this.isPaused || thisMeetingId !== this.meeting?._id;
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

        const previousMessage = meeting.conversation[meeting.conversation.length - 1];
        if (previousMessage?.askParticular === message.speaker) {
            message.type = "response";
        }

        if (message.text === "") {
            message.type = "skipped";
            Logger.warn("meeting", `failed to make a message. Skipping speaker ${action.speaker.id}`, { from: this });
        }

        if (message.type !== "skipped") {
            await annotateDirectedHandoff(this.speakerTargetClassifier, this.serverOptions, meeting, message);
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
        if (message.askParticular) {
            Logger.info(`meeting ${meeting._id}`, `${message.speaker} asked directly to ${message.askParticular}`);
        }

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
