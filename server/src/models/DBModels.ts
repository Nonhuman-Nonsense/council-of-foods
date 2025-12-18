import type { Character, ConversationMessage, Sentence } from '@shared/ModelTypes.js';
import type { Document } from "mongodb";
import type { GlobalOptions } from "@logic/GlobalOptions.js";

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

export interface ConversationState {
    alreadyInvited?: boolean;
    humanName?: string;
    [key: string]: any;
}

export interface ConversationOptions {
    topic: string;
    characters: Character[];
    options: GlobalOptions;
    state?: ConversationState;
    language: string;
}

export interface Meeting extends Document {
    _id: number; // Sequence ID
    date: string; // ISO String
    conversation: ConversationMessage[];
    options: ConversationOptions; // Stored options
    audio: string[]; // List of Audio IDs
    summary?: ConversationMessage; // To be defined strictly later
}

export interface Audio extends Document {
    _id: string; // Message ID (UUID)
    date: string; // ISO String
    meeting_id: number; // Reference to Meeting ID
    audio: Buffer; // Binary Data
    sentences: Sentence[]; // Timing data
}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
