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
    /** One glanceable line, shown on the topic screen. */
    description: string;
    /**
     * Notes for the setup agent to speak from — the stakes and what is
     * contested, deliberately not what {@link description} already says on
     * screen, so hearing and reading it give the visitor two different things.
     * Optional: the agent falls back to the description without it.
     */
    agentBrief?: string;
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
export const SyntheticMessageTypeValues = ["skipped", "awaiting_human_question", "awaiting_human_panelist", "meeting_incomplete", "query_extension", "summary_pending", "letter_pending", "awaiting_letter_addition"] as const;

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
    /** On a `summary` that is a letter (see docs/council-letters.md): the letter as written. */
    letter?: LetterView;
}

/**
 * The letter a being wrote at the end of a meeting, as the summary page and print show it. The
 * summary's `text` is what the author reads aloud — the body and any words of the human's set
 * apart — while the subject, recipient and footer are only shown.
 */
export interface LetterView {
    authorId: string;
    authorName: string;
    recipientName: string;
    recipientOrganisation: string | null;
    subject: string;
    body: string;
    /** The human's own words, set apart after the signature; null when none were. */
    humanNote: string | null;
    footer: string;
    /** The human was there to answer when asked to add something. Only such a letter is printed. */
    present: boolean;
    /** Whether the letter goes out by email; `sendReason` says why not when it does not. */
    send: boolean;
    sendReason: string | null;
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
    /** True when another live session currently holds the meeting (was the separate
     *  `meeting_elsewhere` type); the client shows different copy/actions in that case. */
    elsewhere?: boolean;
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

/**
 * Durable "the server still owes a summary here" marker, pushed atomically alongside the
 * chair's closing line when a meeting concludes. The run loop generates the summary when it
 * sees this at the tail and replaces it in place with the real `summary` message. Being
 * durable, it also drives crash/reconnect recovery: on resume the loop re-generates the
 * summary. Carries no id/text/audio, so the client naturally renders it as a loading state.
 */
export interface SummaryPendingMessage extends BaseMessage {
    type: "summary_pending";
    id?: never;
    text?: never;
    sentences?: never;
    speaker?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

/**
 * Durable "the author still owes its announcement" marker, pushed atomically with the chair's
 * closing line (which hands over to the author) when a meeting ends in a letter. The run loop
 * plans the letter and replaces it with the author's announcement and `awaiting_letter_addition`.
 */
export interface LetterPendingMessage extends BaseMessage {
    type: "letter_pending";
    id?: never;
    text?: never;
    sentences?: never;
    speaker?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

/**
 * The human taking part is asked to add something to the letter. Resolved by
 * `submit_human_message` or `skip_human_turn`, which push the human's words (or a skip) and
 * `summary_pending`; the letter then becomes the meeting's summary.
 */
export interface AwaitingLetterAdditionMessage extends BaseMessage, SpeakerFields, TextFields {
    type: "awaiting_letter_addition";
    id?: never;
    sentences?: never;
    askParticular?: never;
    trimmed?: never;
    pretrimmed?: never;
}

export type SpeakerMessage =
    | GeneratedTurnMessage
    | HumanMessage
    | PanelistMessage
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage
    | AwaitingLetterAdditionMessage;

export type SyntheticMessage =
    | Extract<GeneratedTurnMessage, { type: "skipped" }>
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage
    | MeetingIncompleteMessage
    | QueryExtensionMessage
    | SummaryPendingMessage
    | LetterPendingMessage
    | AwaitingLetterAdditionMessage;

export type Message =
    | GeneratedTurnMessage
    | HumanMessage
    | PanelistMessage
    | AwaitingHumanQuestionMessage
    | AwaitingHumanPanelistMessage
    | MeetingIncompleteMessage
    | QueryExtensionMessage
    | SummaryPendingMessage
    | LetterPendingMessage
    | AwaitingLetterAdditionMessage;

export function isSpeakerMessage(message: Message): message is SpeakerMessage {
    return "speaker" in message;
}

/**
 * A reply to one of the letters, as an installation prints it (docs/council-letters.md →
 * Receiving): who wrote back by name — never their address — and the letter it answers.
 */
export interface PrintableLetterReply {
    id: string;
    meetingId: number;
    kind: "reply" | "opt-out";
    fromName: string | null;
    subject: string;
    /** Markdown, as Brevo extracts it, without the quoted letter, signature or contact details. */
    message: string;
    receivedAt: string;
    letter: { authorId: string; authorName: string; recipientName: string; subject: string; language: string };
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
