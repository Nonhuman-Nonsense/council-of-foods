/// <reference types="node" />
// Defines the available voice options for characters
export const AVAILABLE_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"] as const;
export const AVAILABLE_VOICES_GEMINI = [
    "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe", "Callirrhoe", "Charon", "Despina",
    "Enceladus", "Erinome", "Fenrir", "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Pulcherrima",
    "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi"
] as const;

export const AVAILABLE_VOICES_INWORLD = [
    "Alex", "Ashley", "Blake", "Carter", "Clive", "Craig", "Deborah", "Dennis", "Dominus", "Edward",
    "Elizabeth", "Hades", "Hana", "Julia", "Luna", "Mark", "Olivia", "Pixie", "Priya", "Ronald",
    "Sarah", "Shaun", "Theodore", "Timothy", "Wendy"
] as const;

export type VoiceOption = typeof AVAILABLE_VOICES[number] | typeof AVAILABLE_VOICES_GEMINI[number] | typeof AVAILABLE_VOICES_INWORLD[number];

export interface Topic {
    id: string;
    title: string;
    description: string;
    prompt: string;
}

export interface Meeting {
    _id: number; // Sequence ID
    creatorKey: string;
    date: string; // ISO String
    topic: Topic;
    characters: Character[];
    language: string;
    state: ConversationState;
    conversation: Message[];
    audio: string[]; // List of Audio IDs
    summary?: Message; // To be defined strictly later
}

export interface PlaybackState {
    mode: 'live' | 'replay';
}

export interface ConversationState {
    alreadyInvited: boolean;
    humanName: string | undefined;
}

export interface Character {
    id: string;
    name: string;
    voice: VoiceOption | string;
    voiceProvider?: 'openai' | 'gemini' | 'inworld';
    voiceLocale?: string;
    type?: string;
    prompt?: string;
    voiceInstruction?: string;
    voiceTemperature?: number;
    voiceSpeed?: number;
}

export interface Message {
    type: string;
    id?: string;
    text?: string;
    sentences?: string[];
    speaker?: string;
    askParticular?: string;
    trimmed?: string;
    pretrimmed?: string;
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
