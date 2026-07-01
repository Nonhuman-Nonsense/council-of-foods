import type { Character, Message } from "@shared/ModelTypes.js";
import type { Collection, InsertOneResult } from "mongodb";
import type { OpenAI } from "openai";
import type { Socket } from "socket.io";
import type { StoredMeeting, StoredAudio } from "@models/DBModels.js";
import type { CouncilError } from "@models/Errors.js";
import type { ClientToServerEvents, ServerToClientEvents, AudioUpdatePayload } from "@shared/SocketTypes.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { AudioSystem } from "@logic/AudioSystem.js";
import type { DialogGenerator } from "@logic/DialogGenerator.js";
import type { SpeakerTargetClassifier } from "@logic/SpeakerTargetClassifier.js";
import type { ConversationState } from "@shared/ModelTypes.js";
import type { ConversationService } from "@services/ConversationService.js";

export { ConversationState };

export interface Services {
    meetingsCollection: Collection<StoredMeeting>;
    audioCollection: Collection<StoredAudio>;
    insertMeeting: (meeting: Omit<StoredMeeting, "_id">) => Promise<InsertOneResult<StoredMeeting>>;
    getOpenAI: () => OpenAI;
    conversationService: ConversationService;
}

export interface ConversationOptions {
    topic: string;
    characters: Character[];
    options: GlobalOptions;
    state?: ConversationState;
    language: string;
}

export interface IMeetingBroadcaster {
    broadcastConversationUpdate(conversation: Message[]): void;
    broadcastConversationEnd(): void;
    broadcastAudioUpdate(audio: AudioUpdatePayload): void;
    /**
     * Terminal / server failures the client should treat as a hard stop (500s, conflicts, etc.).
     * Wire format: `conversation_error`. Kept separate from `broadcastWarning` so we can change
     * delivery policy later (e.g. always notify) without touching validation paths.
     */
    broadcastError(error: CouncilError, context?: string): void;
    /**
     * Recoverable client issues (validation, 4xx). Same `conversation_error` event today — the split
     * is intentional: future policy may log-only, downgrade, or skip broadcasting warnings.
     */
    broadcastWarning(error: CouncilError, context?: string): void;
}

/**
 * Basic identity and environment context.
 */
export interface IMeetingContext {
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    environment: string;
    services: {
        meetingsCollection: Collection<StoredMeeting>;
        audioCollection: Collection<StoredAudio>;
        insertMeeting: (meeting: Omit<StoredMeeting, "_id">) => Promise<InsertOneResult<StoredMeeting>>;
        getOpenAI: () => OpenAI;
        conversationService: ConversationService;
    };
    serverOptions: GlobalOptions;
    broadcaster: IMeetingBroadcaster; // New abstraction
}

/**
 * State of the current conversation/meeting.
 */
export interface IMeetingState {
    /** Populated after start or reconnect; null only before a meeting is bound. */
    meeting: StoredMeeting | null;
    serverOptions: GlobalOptions;
    handRaised: boolean;
    isPaused: boolean;
    currentSpeaker: number;
}

/**
 * Methods to control the meeting flow.
 */
export interface IMeetingControl {
    startLoop: () => void;
    isLoopActive: boolean;
}

/**
 * Access to sub-systems.
 */
export interface IMeetingLogicSubsystems {
    audioSystem: AudioSystem;
    dialogGenerator: DialogGenerator;
    speakerTargetClassifier: SpeakerTargetClassifier;
}

/**
 * Context required by HumanInputHandler.
 */
export interface IHumanInputContext extends IMeetingContext, IMeetingState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Context required by HandRaisingHandler.
 */
export interface IHandRaisingContext extends IMeetingContext, IMeetingState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Context required by MeetingLifecycleHandler.
 */
export interface ILifecycleContext extends IMeetingContext, IMeetingState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Composite interface for full access (used by MeetingManager itself and handlers that need everything).
 */
export interface IMeetingManager extends IMeetingContext, IMeetingState, IMeetingControl, IMeetingLogicSubsystems { }
