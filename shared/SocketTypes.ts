/// <reference types="node" />
import type { Message, Character, Sentence, Topic } from "./ModelTypes.js";

// Re-defining or importing types that are passed over the socket

export interface HumanMessage {
    text: string;
    askParticular?: string;
    speaker?: string;
    id?: string;
    type?: string;
    sentences?: string[];
}

export interface InjectionMessage {
    text: string;
    date: string;
    index: number;
    length: number;
}

export interface HandRaisedOptions {
    index: number;
    humanName: string;
}

export interface WrapUpMessage {
    date: string;
}

export interface ReconnectionOptions {
    meetingId: number;
    handRaised?: boolean;
    conversationMaxLength?: number;
}

export interface CreateMeetingBody {
    topic: Topic;
    characters: Character[];
    language: string;
}

export interface SetupOptions {
    meetingId: number;
    creatorKey: string;
    serverOptions?: any; //This is global options object on prototype
}

export interface AudioUpdatePayload {
    id: string;
    audio?: Buffer;
    sentences?: Sentence[];
    type?: string;
}

export interface ErrorPayload {
    message: string;
    code: number;
}

export interface ClientKeyResponse {
    value: string;
}

// Events emitted by the Server to the Client
export interface ServerToClientEvents {
    meeting_started: (data: { meeting_id: number | string | null }) => void; // Using union for safety during transition
    conversation_update: (conversation: Message[]) => void;
    conversation_end: (conversation: Message[]) => void;
    audio_update: (data: AudioUpdatePayload) => void;
    conversation_error: (error: ErrorPayload) => void;
}

// Events received by the Server from the Client
export interface ClientToServerEvents {
    start_conversation: (opts: SetupOptions) => void;
    disconnect: () => void;
    submit_human_message: (msg: HumanMessage) => void;
    submit_human_panelist: (msg: HumanMessage) => void;
    submit_injection: (msg: InjectionMessage) => void;
    raise_hand: (opts: HandRaisedOptions) => void;
    wrap_up_meeting: (msg: WrapUpMessage) => void;
    attempt_reconnection: (opts: ReconnectionOptions) => void;
    continue_conversation: () => void;

    // Prototype only
    pause_conversation: (msg: any) => void;
    resume_conversation: (msg: any) => void;
    remove_last_message: () => void;
}
