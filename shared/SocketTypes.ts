/// <reference types="node" />
import type { Character, Sentence, Topic, Message, Meeting } from "./ModelTypes.js";

// Re-defining or importing types that are passed over the socket

export interface HandRaisedOptions {
    index: number;
    humanName: string;
}

export interface ConcludeMeetingMessage {
    date: string;
}

export interface ReconnectionOptions {
    meetingId: number;
    liveKey: string;
    handRaised?: boolean;
}

/** Live session only: persist furthest played conversation index (`$max` on server). */
export interface ReportMaximumPlayedIndexPayload {
    index: number;
}

export interface CreateMeetingBody {
    topic: Topic;
    characters: Character[];
    language: string;
    /** Audience member name learned during voice setup (optional). */
    humanName?: string;
}

export interface ResumeMeetingResponse {
    meeting: Meeting;
    liveKey: string;
}

export interface SetupOptions {
    meetingId: number;
    liveKey: string;
    serverOptions?: any; //This is global options object on prototype
}

export interface AudioUpdatePayload {
    id: string;
    audio?: Buffer;
    sentences?: Sentence[];
    type?: string;
}

export interface DecodedAudioMessage extends Omit<AudioUpdatePayload, 'audio'> {
    audio: AudioBuffer;
}

/** JSON body for public `GET /api/audio/:audioId` (replay); same bytes as socket `audio_update` after base64 decode. */
export interface PublicAudioClipResponse {
    id: string;
    type?: string;
    sentences?: Sentence[];
    /** Base64-encoded audio bytes (decode then `AudioContext.decodeAudioData`). */
    audioBase64: string;
}

/** Extra detail for internal clients (prototype / development only; omitted in production). */
export interface ClientErrorDebug {
    name?: string;
    stack?: string;
    cause?: unknown;
    context?: string;
    zodIssues?: unknown;
    raw?: unknown;
}

export interface ErrorPayload {
    message: string;
    code: number;
    debug?: ClientErrorDebug;
}

/** HTTP error JSON body (`message` + optional `debug`; status code is on the response). */
export type ApiErrorBody = Pick<ErrorPayload, "message" | "debug">;

export interface ClientKeyResponse {
    value: string;
}

// These are submit DTOs, not canonical conversation messages. The server normalizes them into
// stricter `Message` variants before persistence/broadcast, which keeps the shared message union honest.
export interface SubmitHumanMessagePayload {
    text: string;
}

export interface SubmitHumanPanelistPayload {
    text: string;
    speaker: string;
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
    submit_human_message: (msg: SubmitHumanMessagePayload) => void;
    submit_human_panelist: (msg: SubmitHumanPanelistPayload) => void;
    skip_human_turn: () => void;
    raise_hand: (opts: HandRaisedOptions) => void;
    conclude_meeting: (msg: ConcludeMeetingMessage) => void;
    attempt_reconnection: (opts: ReconnectionOptions) => void;
    report_maximum_played_index: (payload: ReportMaximumPlayedIndexPayload) => void;
    extend_meeting: () => void;

    // Prototype only
    pause_conversation: (msg: any) => void;
    resume_conversation: (msg: any) => void;
}
