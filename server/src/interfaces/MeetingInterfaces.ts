import type { Character, ConversationMessage } from "@shared/ModelTypes.js";
import type { Collection, InsertOneResult } from "mongodb";
import type { OpenAI } from "openai";
import type { Socket } from "socket.io";
import type { Meeting, Audio } from "@models/DBModels.js";
import type { ClientToServerEvents, ServerToClientEvents, AudioUpdatePayload, ClientKeyResponse } from "@shared/SocketTypes.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { AudioSystem } from "@logic/AudioSystem.js";
import type { DialogGenerator } from "@logic/DialogGenerator.js";
import type { ConversationState } from "@shared/ModelTypes.js";

export { ConversationState };

export interface Services {
    meetingsCollection: Collection<Meeting>;
    audioCollection: Collection<Audio>;
    insertMeeting: (meeting: Omit<Meeting, "_id">) => Promise<InsertOneResult<Meeting>>;
    getOpenAI: () => OpenAI;
}

export interface ConversationOptions {
    topic: string;
    characters: Character[];
    options: GlobalOptions;
    state?: ConversationState;
    language: string;
}

export interface IMeetingBroadcaster {
    broadcastMeetingStarted(meetingId: number): void;
    broadcastConversationUpdate(conversation: ConversationMessage[]): void;
    broadcastConversationEnd(): void;
    broadcastAudioUpdate(audio: AudioUpdatePayload): void;
    broadcastClientKey(data: ClientKeyResponse): void;
    broadcastError(message: string, code: number): void;
    broadcastWarning(message: string, code: number, error: Error): void;
}

/**
 * Basic identity and environment context.
 */
export interface IMeetingContext {
    meetingId: number | null;
    conversation: ConversationMessage[];
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    environment: string;
    services: {
        meetingsCollection: Collection<Meeting>;
        audioCollection: Collection<Audio>;
        insertMeeting: (meeting: Omit<Meeting, "_id">) => Promise<InsertOneResult<Meeting>>;
        getOpenAI: () => OpenAI;
    };
    globalOptions: GlobalOptions;
    broadcaster: IMeetingBroadcaster; // New abstraction
}

/**
 * State of the current conversation/meeting.
 */
export interface IConversationState {
    conversation: ConversationMessage[];
    conversationOptions: ConversationOptions;
    handRaised: boolean;
    isPaused: boolean;
    meetingDate: Date | null;
    extraMessageCount: number;
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
}

/**
 * Context required by HumanInputHandler.
 */
export interface IHumanInputContext extends IMeetingContext, IConversationState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Context required by HandRaisingHandler.
 */
export interface IHandRaisingContext extends IMeetingContext, IConversationState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Context required by MeetingLifecycleHandler.
 */
export interface ILifecycleContext extends IMeetingContext, IConversationState, IMeetingControl, IMeetingLogicSubsystems { }

/**
 * Composite interface for full access (used by MeetingManager itself and handlers that need everything).
 */
export interface IMeetingManager extends IMeetingContext, IConversationState, IMeetingControl, IMeetingLogicSubsystems { }
