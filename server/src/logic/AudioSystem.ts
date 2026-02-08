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
import { parseBuffer } from 'music-metadata';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
export async function mergeAudioBuffers(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 0) {
        throw new Error('Cannot merge empty array of buffers');
    }

    if (buffers.length === 1) {
        return buffers[0];
    }

    const tempDir = tmpdir();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const tempFiles: string[] = [];
    const listFile = join(tempDir, `ffmpeg-list-${timestamp}-${randomId}.txt`);
    const outputFile = join(tempDir, `merged-${timestamp}-${randomId}.ogg`);

    try {
        // Write each buffer to a temporary file
        for (let i = 0; i < buffers.length; i++) {
            const tempFile = join(tempDir, `chunk-${timestamp}-${randomId}-${i}.ogg`);
            await fs.writeFile(tempFile, buffers[i]);
            tempFiles.push(tempFile);
        }

        // Create concat list file
        const listContent = tempFiles.map(f => `file '${f}'`).join('\n');
        await fs.writeFile(listFile, listContent);

        if (!ffmpegPath) {
            throw new Error('FFmpeg binary not found');
        }

        // Run FFmpeg using spawn
        await new Promise<void>((resolve, reject) => {
            const args = [
                '-f', 'concat',
                '-safe', '0',
                '-i', listFile,
                '-c', 'copy', // Copy codec without re-encoding
                outputFile
            ];

            const ffmpegProcess = spawn(ffmpegPath as unknown as string, args);

            let errorOutput = '';

            ffmpegProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}: ${errorOutput}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error(`Failed to start FFmpeg process: ${err.message}`));
            });
        });

        // Read merged file
        const mergedBuffer = await fs.readFile(outputFile);
        return mergedBuffer;

    } finally {
        // Cleanup temp files
        const filesToClean = [...tempFiles, listFile, outputFile];
        await Promise.all(
            filesToClean.map(f => fs.unlink(f).catch(() => {
                // Ignore cleanup errors
            }))
        );
    }
}

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
            const textChunks = this.splitText(message.text, limit);

            if (generateNew || buffers.length === 0) {
                // Generate audio for all chunks in parallel
                buffers = await Promise.all(textChunks.map(chunk => this.generateProviderAudio(chunk, speaker, effectiveOptions)));
                generateNew = true;
            }

            const shouldSkipMatching = skipMatching || effectiveOptions.skipMatchingSubtitles || environment === 'prototype';

            let sentencesWithTimings: any[] = [];

            if (!shouldSkipMatching) {
                // Get timings for all chunks in parallel
                const timingsPromises = buffers.map(buffer => this.getSentenceTimings(buffer, message));
                // Note: we pass full message just for sentences ref? getSentenceTimings implementation needs review.
                // Actually getSentenceTimings uses mapSentencesToWords which uses message.sentences.
                // We need to be careful here. The full message sentences correspond to the full text.
                // If we run whisper on chunks, we get words for chunks.
                // We should probably stitch words together then map to sentences?
                // OR: 
                // We can run Whisper on each chunk to get words/timings.
                // We then need to offset these timings.
                // Finally we have a big list of words with correct absolute timings.
                // Then we run mapSentencesToWords ONCE with the full list of words and full list of sentences.

                // Revised strategy for timings:
                // 1. Get Whisper words for each chunk.
                // 2. Get duration of each chunk to calculate offsets.
                // 3. Flatten words with offsets.
                // 4. Map to sentences.

                const chunkWordsWithTimings = await Promise.all(buffers.map(b => this.getWhisperWords(b)));

                // Calculate durations
                const durations = await Promise.all(buffers.map(async b => {
                    try {
                        const metadata = await parseBuffer(b);
                        return metadata.format.duration || 0;
                    } catch (e) {
                        Logger.warn("AudioSystem", `Failed to parse audio duration`, e);
                        return 0; // Fallback? Or maybe calculate from last word?
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

                    // Helper: if duration is 0 (failed parse), use end of last word as heuristic?
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

    private splitText(text: string, limit: number): string[] {
        if (text.length <= limit) return [text];

        const chunks: string[] = [];
        let currentText = text;

        while (currentText.length > limit) {
            let splitIndex = -1;

            // Try splitting by double newline (paragraph)
            // Look for last \n\n within limit
            const doubleNewlineIndex = currentText.lastIndexOf('\n\n', limit);
            if (doubleNewlineIndex !== -1) {
                splitIndex = doubleNewlineIndex;
            } else {
                // Try single newline
                const newlineIndex = currentText.lastIndexOf('\n', limit);
                if (newlineIndex !== -1) {
                    splitIndex = newlineIndex;
                } else {
                    // Try sentence (period space)
                    const sentenceIndex = currentText.lastIndexOf('. ', limit);
                    if (sentenceIndex !== -1) {
                        splitIndex = sentenceIndex + 1; // Include period
                    } else {
                        // Hard split
                        splitIndex = limit;
                    }
                }
            }

            chunks.push(currentText.substring(0, splitIndex).trim());
            currentText = currentText.substring(splitIndex).trim();
        }

        if (currentText.length > 0) {
            chunks.push(currentText);
        }

        return chunks;
    }

    private async generateProviderAudio(text: string, speaker: Speaker, options: AudioSystemOptions): Promise<Buffer> {
        if (speaker.voiceProvider === 'gemini') {
            // ... Gemini logic ...
            // Extract Gemini logic from original generateAudio to here or helper
            // For brevity, refactoring logic:
            return this.generateGeminiAudio(text, speaker, options);
        } else if (speaker.voiceProvider === 'inworld') {
            return this.generateInworldAudio(text, speaker, options);
        } else {
            // OpenAI
            return this.generateOpenAIAudio(text, speaker, options);
        }
    }

    // Refactored helpers for providers
    private async generateGeminiAudio(text: string, speaker: Speaker, options: AudioSystemOptions): Promise<Buffer> {
        const geminiModel = options.geminiVoiceModel;
        const voiceName = speaker.voice;
        let googleLangCode = getGoogleLanguageCode(options.language);
        if (options.language === 'en' && speaker.voiceLocale) {
            googleLangCode = speaker.voiceLocale;
        }

        const token = await this.getGoogleAuthToken();
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize`;

        const input: { text: string; prompt?: string } = { text: text.substring(0, 4096) };
        if (speaker.voiceInstruction) input.prompt = speaker.voiceInstruction;

        const body = {
            input,
            voice: {
                languageCode: googleLangCode,
                name: voiceName,
                model_name: geminiModel
            },
            audioConfig: {
                audioEncoding: "OGG_OPUS",
                speakingRate: options.audio_speed
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
            return Buffer.from(data.audioContent, 'base64');
        } else {
            throw new Error("No audio content returned from Google TTS");
        }
    }

    private async generateOpenAIAudio(text: string, speaker: Speaker, options: AudioSystemOptions): Promise<Buffer> {
        const openai = this.services.getOpenAI();
        const mp3 = await withNetworkRetry(() => openai.audio.speech.create({
            model: options.voiceModel,
            voice: speaker.voice as any,
            speed: options.audio_speed,
            input: text.substring(0, 4096),
            instructions: speaker.voiceInstruction
        }));
        return Buffer.from(await mp3.arrayBuffer());
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

    // Helper to get raw whisper words for a buffer
    async getWhisperWords(buffer: Buffer): Promise<Word[]> {
        const openai = this.services.getOpenAI();
        const audioFile = new File([new Uint8Array(buffer)], "speech.mp3", { type: "audio/mpeg" });
        const transcription = await withNetworkRetry(() => openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        }), "AudioSystemWhisper");
        return (transcription.words || []) as Word[];
    }

    // Kept for signature compatibility if used elsewhere, but internally we use getWhisperWords + mapping
    async getSentenceTimings(buffer: Buffer, message: Message): Promise<any[]> {
        const words = await this.getWhisperWords(buffer);
        return mapSentencesToWords(message.sentences, words);
    }
}
