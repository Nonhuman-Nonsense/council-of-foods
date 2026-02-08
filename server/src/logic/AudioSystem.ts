import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import { Logger } from "@utils/Logger.js";
import { mapSentencesToWords, Word } from "@utils/textUtils.js";
import { GoogleAuth } from 'google-auth-library';
import { parseBuffer } from 'music-metadata';
import {
    generateGeminiAudio,
    generateInworldAudio,
    generateOpenAIAudio,
    getWhisperWords
} from "./audio/TTSProviders.js";
import {
    AudioQueue,
    mergeAudioBuffers,
    splitText
} from "./audio/AudioUtils.js";
import {
    AudioContext,
    AudioSystemOptions,
    Message,
    Services,
    Speaker
} from "./audio/AudioTypes.js";

// Re-export types for compatibility
export * from "./audio/AudioTypes.js";
export * from "./audio/AudioUtils.js";

// Limit for text-to-speech requests
const MAX_AUDIO_CHUNK_LENGTH = 2000;

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
    private async getGoogleAuthToken(): Promise<GoogleAuth> {
        if (!this.googleAuthClient) {
            try {
                // Use standard Google Application Default Credentials (ADC) strategy
                this.googleAuthClient = new GoogleAuth({
                    scopes: ['https://www.googleapis.com/auth/cloud-platform']
                });
            } catch (e) {
                Logger.error("AudioSystem", "Failed to load Google credentials", e);
                throw e;
            }
        }
        return this.googleAuthClient;
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

        let buffers: Buffer[] = [];
        let generateNew = true;

        let existingAudio: any;
        try {
            existingAudio = await this.services.audioCollection.findOne({ _id: message.id });
            if (existingAudio) {
                let singleBuffer;
                if (existingAudio.buffer?.buffer) singleBuffer = Buffer.from(existingAudio.buffer.buffer);
                else if (existingAudio.audio?.buffer) singleBuffer = Buffer.from(existingAudio.audio.buffer);
                else singleBuffer = existingAudio.buffer || existingAudio.audio;

                if (singleBuffer) {
                    buffers = [singleBuffer];
                    generateNew = false;
                }
            }
        } catch (error: unknown) {
            Logger.error(`AudioSystem`, `Error retrieving existing audio (message id: ${message.id})`, error);
        }


        try {
            const limit = MAX_AUDIO_CHUNK_LENGTH;
            const textChunks = splitText(message.text, limit);

            if (textChunks.length > 1) {
                Logger.info("AudioSystem", `Message ${message.id} split into ${textChunks.length} chunks for TTS.`);
            }

            if (generateNew || buffers.length === 0) {
                Logger.info("AudioSystem", `Generating new audio for message ${message.id} (${speaker.voiceProvider}/${speaker.voice})`);
                // Generate audio for all chunks in parallel
                buffers = await Promise.all(textChunks.map(chunk => this.generateProviderAudio(chunk, speaker, effectiveOptions)));
                generateNew = true;
            }

            const shouldSkipMatching = skipMatching || effectiveOptions.skipMatchingSubtitles || environment === 'prototype';

            let sentencesWithTimings: any[] = [];

            if (!shouldSkipMatching) {
                // Get timings for all chunks in parallel
                // Note: getWhisperWords logic is stateless now.
                const chunkWordsWithTimings = await Promise.all(buffers.map(b => this.getWhisperWordsWrapper(b)));

                // Calculate durations
                const durations = await Promise.all(buffers.map(async b => {
                    try {
                        const metadata = await parseBuffer(b);
                        return metadata.format.duration || 0;
                    } catch (e) {
                        Logger.warn("AudioSystem", `Failed to parse audio duration`, e);
                        return 0;
                    }
                }));

                let currentOffset = 0;
                let allWords: Word[] = [];

                chunkWordsWithTimings.forEach((words, index) => {
                    const offsetWords = words.map(w => ({
                        ...w,
                        start: w.start + currentOffset,
                        end: w.end + currentOffset
                    }));
                    allWords.push(...offsetWords);

                    const duration = durations[index];
                    if (duration > 0) {
                        currentOffset += duration;
                    } else if (words.length > 0) {
                        currentOffset = offsetWords[offsetWords.length - 1].end + 0.5; // padding
                    }
                });

                sentencesWithTimings = mapSentencesToWords(message.sentences, allWords);
            } else {
                sentencesWithTimings = [];
            }

            // Merge chunks into single buffer using FFmpeg
            const combinedBuffer = await mergeAudioBuffers(buffers);

            // Construct payload
            const audioObject: any = {
                id: message.id,
                audio: combinedBuffer,
                sentences: sentencesWithTimings
            };

            Logger.info("AudioSystem", `Audio generated for message ${message.id}. Size: ${combinedBuffer.length} bytes.`);



            this.broadcaster.broadcastAudioUpdate(audioObject);

            if (generateNew && environment !== "prototype") {
                // Upsert logic
                await this.services.audioCollection.updateOne(
                    { _id: audioObject.id },
                    {
                        $set: {
                            date: new Date().toISOString(),
                            meeting_id: meetingId,
                            audio: combinedBuffer,
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

    private async generateProviderAudio(text: string, speaker: Speaker, options: AudioSystemOptions): Promise<Buffer> {
        const baseParams = { text, speaker, options };

        if (speaker.voiceProvider === 'gemini') {
            const auth = await this.getGoogleAuthToken();
            return generateGeminiAudio({ ...baseParams, auth });
        } else if (speaker.voiceProvider === 'inworld') {
            return generateInworldAudio(baseParams);
        } else {
            // OpenAI
            return generateOpenAIAudio({ ...baseParams, services: this.services });
        }
    }

    // Helper to get raw whisper words for a buffer
    async getWhisperWordsWrapper(buffer: Buffer): Promise<Word[]> {
        return getWhisperWords(buffer, this.services);
    }

    // Kept for backward compatibility if used externally
    async getWhisperWords(buffer: Buffer): Promise<Word[]> {
        return this.getWhisperWordsWrapper(buffer);
    }

    // Kept for signature compatibility if used elsewhere
    async getSentenceTimings(buffer: Buffer, message: Message): Promise<any[]> {
        const words = await this.getWhisperWordsWrapper(buffer);
        return mapSentencesToWords(message.sentences, words);
    }
}
