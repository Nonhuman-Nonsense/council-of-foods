
export interface Character {
    id: string;
    name: string;
    voice: string;
    [key: string]: any;
}

export interface ConversationMessage {
    type: string;
    id?: string;
    text?: string;
    sentences?: string[];
    speaker?: string;
    askParticular?: string;
    [key: string]: any;
}

export interface ConversationState {
    alreadyInvited?: boolean;
    humanName?: string;
    [key: string]: any;
}

export interface Sentence {
    text: string;
    start: number;
    end: number;
}
