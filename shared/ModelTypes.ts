
// Match OpenAI's expected voice types
export type OpenAIVoice = "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer" | "verse";

export interface Character {
    id: string;
    name: string;
    voice: OpenAIVoice;
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
