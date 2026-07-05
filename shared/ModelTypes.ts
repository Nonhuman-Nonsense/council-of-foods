/// <reference types="node" />
// Defines the available voice options for characters
export const AVAILABLE_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"] as const;

export const AVAILABLE_VOICES_INWORLD = [
    "Alex", "Ashley", "Blake", "Carter", "Clive", "Craig", "Deborah", "Dennis", "Dominus", "Edward",
    "Elizabeth", "Hades", "Hana", "Julia", "Luna", "Mark", "Olivia", "Pixie", "Priya", "Ronald",
    "Sarah", "Shaun", "Theodore", "Timothy", "Wendy"
] as const;

export type VoiceOption = typeof AVAILABLE_VOICES[number] | typeof AVAILABLE_VOICES_INWORLD[number];

export interface Topic {
    id: string;
    title: string;
    description: string;
    prompt: string;
    /** Optional agenda items; rendered via [AGENDA_POINTS] in the system prompt at meeting setup. */
    agendaPoints?: string[];
}

export interface BaseMeeting {
    _id: number; // Sequence ID
    date: string; // ISO String
    topic: Topic;
    characters: Character[];
    language: string;
    state: ConversationState;
    conversation: Message[];
    audio: string[]; // List of Audio IDs
    maximumPlayedIndex?: number | null;
    conversationExtraSlots: number;
    /** True once conclude audio barrier finished and replay is autoplay-eligible. */
    meetingComplete: boolean;
}

export interface Meeting extends BaseMeeting {
    /** This property must NOT exist on a public Meeting object */
    liveKey?: never; 
}

export interface PlaybackState {
    mode: 'live' | 'replay';
}

export interface ConversationState {
    alreadyInvited: boolean;
    humanName?: string;
}

export interface Character {
    id: string;
    name: string;
    voice: VoiceOption | string;
    description: string;
    prompt: string;
    voiceProvider?: 'openai' | 'inworld' | 'elevenlabs';
    voiceLocale?: string;
    voiceInstruction?: string;
    voiceTemperature?: number;
    voiceStability?: number;
    voiceStyle?: number;
    voiceSpeed?: number;
    size?: number;
    // type?: string;
    // index?: number;
}

export interface CharacterSetupData {
    metadata: {
        version: string;
        last_updated: string;
    };
    panelWithHumans: string;
    addHuman: {
        id: string;
        name: string;
        description: string;
    };
    characters: Character[];
}

// For Zod validation
export const MessageTypeValues = ["message", "human", "panelist", "summary", "response", "invitation", "interjection"] as const;
export const SyntheticMessageTypeValues = ["skipped", "awaiting_human_question", "awaiting_human_panelist", "meeting_incomplete", "query_extension"] as const;

// Derive the types from the arrays
export type MessageType = (typeof MessageTypeValues)[number];
export type SyntheticMessageType = (typeof SyntheticMessageTypeValues)[number];

// `Message` is the canonical stored/broadcast conversation record. Keep submit payloads separate
// in `SocketTypes` so conversation invariants stay strict and the client/server can narrow on `type`.
interface BaseMessage {
    type: MessageType | SyntheticMessageType;
}

interface SpeakerFields {
    speaker: string;
}

interface TextFields {
    text: string;
}

interface IdentifiedFields {
    id: string;
}

interface SentenceFields {
    sentences?: string[];
}

interface GeneratedDebugFields {
    trimmed?: string;
    pretrimmed?: string;
}

type GeneratedTurnType =
    | "message"
    | "response"
    | "summary"
    | "invitation"
    | "interjection"
    | "skipped";

export interface GeneratedTurnMessage
    extends BaseMessage, SpeakerFields, TextFields, IdentifiedFields, SentenceFields, GeneratedDebugFields {
    type: GeneratedTurnType;
    askParticular?: string;
}

export interface HumanMessage extends BaseMessage, SpeakerFields, TextFields, IdentifiedFields, SentenceFields {
    type: "human";
    askParticular?: string;
    trimmed?: never;
    pretrimmed?: never;
}

export interface PanelistMessage extends BaseMessage, SpeakerFields, TextFields, IdentifiedFields, SentenceFields {
    type: "panelist";
    askParticular?: string;
    trimmed?: never;
    pretrimmed?: never;
}

export interface AwaitingHumanQuestionMessage extends BaseMessage, SpeakerFields, TextFields {
    type: "awaiting_human_question";
    id?: never;
    sentences?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

export interface AwaitingHumanPanelistMessage extends BaseMessage, SpeakerFields, TextFields {
    type: "awaiting_human_panelist";
    id?: never;
    sentences?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

export interface MeetingIncompleteMessage extends BaseMessage {
    type: "meeting_incomplete";
    id?: never;
    text?: never;
    sentences?: never;
    speaker?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

export interface QueryExtensionMessage extends BaseMessage {
    type: "query_extension";
    id?: never;
    text?: never;
    sentences?: never;
    speaker?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

export type SpeakerMessage =
    | GeneratedTurnMessage
    | HumanMessage
    | PanelistMessage
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage;

export type SyntheticMessage =
    | Extract<GeneratedTurnMessage, { type: "skipped" }>
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage
    | MeetingIncompleteMessage
    | QueryExtensionMessage;

export type Message =
    | GeneratedTurnMessage
    | HumanMessage
    | PanelistMessage
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage
    | MeetingIncompleteMessage
    | QueryExtensionMessage;

export function isSpeakerMessage(message: Message): message is SpeakerMessage {
    return "speaker" in message;
}

export interface Audio {
    _id: string; // Message ID (UUID)
    date: string; // ISO String
    meeting_id: number; // Reference to Meeting ID
    audio: Buffer; // Binary Data
    sentences: Sentence[]; // Timing data
}

export interface Sentence {
    text: string;
    start: number;
    end: number;
}
