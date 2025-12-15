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

/**
 * Basic identity and environment context.
 */
export interface IMeetingContext {
    meetingId: number | null;
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    environment: string;
    services: Services;
    globalOptions: GlobalOptions;
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
 * Composite interface for full access (used by MeetingManager itself and handlers that need everything).
 */
export interface IMeetingManager extends IMeetingContext, IConversationState, IMeetingControl, IMeetingLogicSubsystems { }
