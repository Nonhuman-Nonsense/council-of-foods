
export interface Character {
    id: string;
    name: string;
    voice: string;
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
