import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { Meeting, Audio } from "@models/DBModels.js";
import type { OpenAI } from "openai";
import type { Collection } from "mongodb";
import type { VoiceOption } from "@shared/ModelTypes.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

import { Logger } from "@utils/Logger.js";
import { mapSentencesToWords, Word } from "@utils/textUtils.js";
import { GoogleAuth } from 'google-auth-library';
import { GOOGLE_LANGUAGE_MAP } from "@shared/AvailableLanguages.js";

function getGoogleLanguageCode(appLang?: string): string {
    if (!appLang) return 'en-GB';
    return GOOGLE_LANGUAGE_MAP[appLang] || 'en-GB';
}

// OpenAI SDK accepts Buffer/Stream for 'file'.
// Using File object for compatibility.

export type AudioTask = () => Promise<void>;


export class AudioQueue {
    queue: AudioTask[];
    activeCount: number;
    concurrency: number;

    constructor(concurrency: number = 3) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = concurrency;
    }

    add(task: AudioTask): void {
        this.queue.push(task);
        this.processNext();
    }

    async processNext(): Promise<void> {
        if (this.activeCount >= this.concurrency || this.queue.length === 0) return;

        this.activeCount++;
        const task = this.queue.shift();

        if (task) {
            try {
                // Start the task asynchronously
                this.runTask(task);
                // Try to start another task if concurrency allows
                this.processNext();
            } catch (error) {
                //This block will only catch synchronous errors
                Logger.error("AudioSystem", "Error starting audio task", error);
                this.activeCount--;
            }
        }
    }

    async runTask(task: AudioTask): Promise<void> {
        try {
            await task();
        } catch (error) {
            //This block will catch asynchronous errors
            Logger.error("AudioSystem", "Audio Task Error", error);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }
}

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

/**
 * Handles concurrent audio generation and queuing.
 * Manages the generation of TTS (Text-to-Speech) using OpenAI's API.
 * 
 * Features:
 * - Concurrency control using helper AudioQueue.
 * - Integration with Database to cache generated audio.
 * - Error suppression for test environments (shutdown/ECONNRESET).
 * - Skipping audio generation based on configuration (skipAudio).
 */
export class AudioSystem {
    broadcaster: IMeetingBroadcaster;
    services: Services;
    queue: AudioQueue;
    private googleAuthClient: GoogleAuth | null = null;

    constructor(broadcaster: IMeetingBroadcaster, services: Services, concurrency: number = 3) {
        this.broadcaster = broadcaster;
        this.services = services;
        this.queue = new AudioQueue(concurrency);
    }

    /**
     * Lazily initializes and caches the GoogleAuth client.
     * Reuses the client to leverage built-in token caching.
     */
    private async getGoogleAuthToken(): Promise<string> {
        if (!this.googleAuthClient) {
            try {
                // Use standard Google Application Default Credentials (ADC) strategy
                // This automatically picks up specific env vars like GOOGLE_APPLICATION_CREDENTIALS
                this.googleAuthClient = new GoogleAuth({
                    scopes: ['https://www.googleapis.com/auth/cloud-platform']
                });
            } catch (e) {
                Logger.error("AudioSystem", "Failed to load Google credentials", e);
                throw e;
            }
        }

        const client = await this.googleAuthClient.getClient();
        const accessToken = await client.getAccessToken();
        return accessToken.token || '';
    }

    queueAudioGeneration(message: Message, speaker: Speaker, context: AudioContext, meetingId: number, environment: string): void {
        this.queue.add(() => this.generateAudio(message, speaker, context, meetingId, environment));
    }

    /**
     * Generates or retrieves audio for a given message.
     * Emits 'audio_update' to the socket client.
     */
    async generateAudio(message: Message, speaker: Speaker, context: AudioContext, meetingId: number, environment: string, skipMatching: boolean = false): Promise<void> {
        const { options } = context;
        // Merge context language into options for consistent usage internally
        const effectiveOptions: AudioSystemOptions = { ...options, language: context.language || options.language };

        if (effectiveOptions.skipAudio) return;

        if (message.type === "skipped") {
            this.broadcaster.broadcastAudioUpdate({ id: message.id, type: "skipped" });
            return;
        }

        let buffer: Buffer | undefined;
        let generateNew = true;
        try {
            const existingAudio = await this.services.audioCollection.findOne({ _id: message.id });
            if (existingAudio) {
                buffer = existingAudio.buffer?.buffer ? Buffer.from(existingAudio.buffer.buffer) : existingAudio.audio?.buffer ? Buffer.from(existingAudio.audio.buffer) : existingAudio.buffer;
                // Handling potential bson binary format difference
                // But for now, let's assume it works as before or cast.
                // Reverting to robust check:
                if (!buffer && existingAudio.audio) buffer = existingAudio.audio; // Legacy
                // Actually, existingAudio.buffer is often Binary type.

                generateNew = false;
            }
        } catch (error: unknown) {
            //Let's report this to see if it ever happens
            //But let the client continue
            Logger.error(`AudioSystem`, `Error retrieving existing audio (message id: ${message.id})`, error);
        }

        try {
            if (generateNew || !buffer) {
                if (speaker.voiceProvider === 'gemini') {
                    // Use configured model (defaulting to Flash via global-options) or user preference
                    const geminiModel = effectiveOptions.geminiVoiceModel;
                    const voiceName = speaker.voice;
                    // Prioritize speaker-specific locale ONLY if language is English
                    let googleLangCode = getGoogleLanguageCode(effectiveOptions.language);
                    if (effectiveOptions.language === 'en' && speaker.voiceLocale) {
                        googleLangCode = speaker.voiceLocale;
                    }

                    // --- Service Account Auth Strategy ---
                    // Helper method handles caching of the auth client
                    const token = await this.getGoogleAuthToken();

                    const url = `https://texttospeech.googleapis.com/v1/text:synthesize`; // No key param needed with Bearer token

                    // Construct Input Payload
                    const input: { text: string; prompt?: string } = {
                        text: message.text.substring(0, 4096)
                    };

                    if (speaker.voiceInstruction) {
                        input.prompt = speaker.voiceInstruction;
                    }

                    const body = {
                        input,
                        voice: {
                            languageCode: googleLangCode,
                            name: voiceName,
                            model_name: geminiModel
                        },
                        audioConfig: {
                            audioEncoding: "OGG_OPUS",
                            speakingRate: effectiveOptions.audio_speed
                        }
                    };

                    const response = await withNetworkRetry(() => fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(body)
                    }), "AudioSystemGemini");

                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Google TTS API Error: ${response.status} ${errText}`);
                    }

                    const data = await response.json();
                    if (data.audioContent) {
                        buffer = Buffer.from(data.audioContent, 'base64');
                        generateNew = true;
                    } else {
                        throw new Error("No audio content returned from Google TTS");
                    }
                } else if (speaker.voiceProvider === 'inworld') {
                    buffer = await this.generateInworldAudio(message.text, speaker, effectiveOptions);
                    generateNew = true;
                } else {
                    // Default to OpenAI
                    const openai = this.services.getOpenAI();
                    const mp3 = await withNetworkRetry(() => openai.audio.speech.create({
                        model: effectiveOptions.voiceModel,
                        voice: speaker.voice as any, // Cast to any or OpenAI compatible type since we unioned them
                        speed: effectiveOptions.audio_speed,
                        input: message.text.substring(0, 4096),
                        instructions: speaker.voiceInstruction
                    }));
                    buffer = Buffer.from(await mp3.arrayBuffer());
                    generateNew = true;
                }
            }

            const shouldSkipMatching = skipMatching || effectiveOptions.skipMatchingSubtitles || environment === 'prototype';
            const sentencesWithTimings = shouldSkipMatching ? [] : await this.getSentenceTimings(buffer!, message);

            const audioObject = {
                id: message.id,
                audio: buffer,
                sentences: sentencesWithTimings
            };

            this.broadcaster.broadcastAudioUpdate(audioObject);

            if (generateNew && environment !== "prototype") {
                // Upsert logic
                await this.services.audioCollection.updateOne(
                    { _id: audioObject.id },
                    {
                        $set: {
                            date: new Date().toISOString(),
                            meeting_id: meetingId,
                            audio: buffer,
                            sentences: sentencesWithTimings
                        }
                    },
                    { upsert: true }
                );
            }
            if (environment !== "prototype") {
                await this.services.meetingsCollection.updateOne(
                    { _id: meetingId },
                    { $addToSet: { audio: audioObject.id } }
                );
            }

        } catch (error: unknown) {

            //Crash the client and report
            Logger.reportAndCrashClient("AudioSystem", "Error generating audio", error, this.broadcaster);
        }
    }

    private async generateInworldAudio(text: string, speaker: Speaker, options: AudioSystemOptions): Promise<Buffer> {
        const apiKey = process.env.INWORLD_API_KEY;

        const url = 'https://api.inworld.ai/tts/v1/voice';

        const response = await withNetworkRetry(() => fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voice_id: speaker.voice,
                model_id: options.inworldVoiceModel,
                temperature: speaker.voiceTemperature || 1.0,
                audio_config: {
                    audio_encoding: "OGG_OPUS",
                    speaking_rate: options.audio_speed
                },
                // Phase 1: We do NOT ask for timestampType: "WORD" yet, as we rely on Whisper
            })
        }), "AudioSystemInworld");

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Inworld TTS API Error: ${response.status} ${errText}`);
        }

        const data: any = await response.json();
        if (data.audioContent) {
            return Buffer.from(data.audioContent, 'base64');
        } else {
            throw new Error("No audio content returned from Inworld TTS");
        }
    }

    async getSentenceTimings(buffer: Buffer, message: Message): Promise<any[]> {
        const openai = this.services.getOpenAI();
        const audioFile = new File([new Uint8Array(buffer)], "speech.mp3", { type: "audio/mpeg" });
        const transcription = await withNetworkRetry(() => openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        }), "AudioSystemWhisper");
        return mapSentencesToWords(message.sentences, (transcription.words || []) as Word[]);
    }
}
