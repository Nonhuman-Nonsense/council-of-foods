
// Defines the available voice options for characters
export const AVAILABLE_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"] as const;
export type VoiceOption = typeof AVAILABLE_VOICES[number];

export interface Character {
    id: string;
    name: string;
    voice: VoiceOption;
    type?: string;
    prompt?: string;
}

export interface ConversationMessage {
    type: string;
    id?: string;
    text?: string;
    sentences?: string[];
    speaker?: string;
    askParticular?: string;
    trimmed?: string;
    pretrimmed?: string;
}

export interface ConversationState {
    alreadyInvited?: boolean;
    humanName?: string;
}

export interface Sentence {
    text: string;
    start: number;
    end: number;
}
