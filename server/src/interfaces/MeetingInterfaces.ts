import { Collection, InsertOneResult } from "mongodb";
import { OpenAI } from "openai";
import { Socket } from "socket.io";
import { Meeting, Audio } from "@models/DBModels.js";
import { ClientToServerEvents, ServerToClientEvents } from "@shared/SocketTypes.js";
import { Character, ConversationMessage } from "@shared/ModelTypes.js";
import { GlobalOptions } from "@logic/GlobalOptions.js";
import { AudioSystem } from "@logic/AudioSystem.js";
import { DialogGenerator } from "@logic/DialogGenerator.js";
import { ConversationState } from "@shared/ModelTypes.js";

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
    broadcastConversationEnd(conversation: ConversationMessage[]): void;
    broadcastClientKey(data: any): void;
    broadcastError(message: string, code: number): void;
    broadcastMeetingNotFound(meetingId: string): void;
}

/**
 * Basic identity and environment context.
 */
export interface IMeetingContext {
    meetingId: number | null;
    conversation: ConversationMessage[];
    socket: Socket;
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
    run: boolean;
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
