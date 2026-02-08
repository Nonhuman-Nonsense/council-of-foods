import type { Collection } from "mongodb";
import type { OpenAI } from "openai";
import type { Meeting, Audio } from "@models/DBModels.js";
import type { VoiceOption } from "@shared/ModelTypes.js";

// Re-export AudioTask from AudioUtils or move here? Let's move AudioTask here if it's used across files.
// Actually AudioTask is used in AudioQueue which is in AudioUtils. Let's keep AudioTask in AudioUtils or export it from there.

export interface Services {
    audioCollection: Collection<Audio>;
    meetingsCollection: Collection<Meeting>;
    getOpenAI: () => OpenAI;
}

export interface Speaker {
    id: string;
    voice: VoiceOption | string;
    voiceProvider?: 'openai' | 'gemini' | 'inworld';
    voiceLocale?: string;
    name?: string;
    voiceInstruction?: string;
    voiceTemperature?: number;
}

export interface Message {
    id: string;
    type?: string;
    text: string;
    sentences: string[];
}

// Redefine AudioSystemOptions to include language directly, merging concepts.
export interface AudioSystemOptions {
    voiceModel: string;
    geminiVoiceModel: string;
    inworldVoiceModel: string;
    audio_speed: number;
    language?: string;
    skipAudio?: boolean;
    skipMatchingSubtitles?: boolean;
}

/**
 * Helper interface to match the structure of ConversationOptions for easier passing.
 */
export interface AudioContext {
    options: AudioSystemOptions;
    language?: string;
}
