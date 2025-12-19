import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { Meeting, Audio } from "@models/DBModels.js";
import type { OpenAI } from "openai";
import type { Collection } from "mongodb";
import type { VoiceOption } from "@shared/ModelTypes.js";

import { reportError } from "@utils/errorbot.js";
import { Logger } from "@utils/Logger.js";
import { mapSentencesToWords, Word } from "@utils/textUtils.js";

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
            reportError("AudioSystem", "Audio Task Error", error);
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
    voice: VoiceOption;
    name?: string;
}

export interface Message {
    id: string;
    type?: string;
    text: string;
    sentences: string[];
}

export interface AudioSystemOptions {
    voiceModel: string;
    audio_speed: number;
    skipAudio?: boolean;
    skipMatchingSubtitles?: boolean;
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

    constructor(broadcaster: IMeetingBroadcaster, services: Services, concurrency: number = 3) {
        this.broadcaster = broadcaster;
        this.services = services;
        this.queue = new AudioQueue(concurrency);
    }

    queueAudioGeneration(message: Message, speaker: Speaker, options: AudioSystemOptions, meetingId: number, environment: string): void {
        this.queue.add(() => this.generateAudio(message, speaker, options, meetingId, environment));
    }

    /**
     * Generates or retrieves audio for a given message.
     * Emits 'audio_update' to the socket client.
     */
    async generateAudio(message: Message, speaker: Speaker, options: AudioSystemOptions, meetingId: number, environment: string, skipMatching: boolean = false): Promise<void> {
        if (options.skipAudio) return;

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
            reportError(`AudioSystem`, `Error retrieving existing audio (message id: ${message.id})`, error);
        }

        try {
            const openai = this.services.getOpenAI();
            if (generateNew || !buffer) {
                const mp3 = await openai.audio.speech.create({
                    model: options.voiceModel,
                    voice: speaker.voice,
                    speed: options.audio_speed,
                    input: message.text.substring(0, 4096),
                });
                buffer = Buffer.from(await mp3.arrayBuffer());
                generateNew = true; // Ensure we save it if we regenerated it because buffer was missing
            }

            const shouldSkipMatching = skipMatching || options.skipMatchingSubtitles || environment === 'prototype';
            const sentencesWithTimings = shouldSkipMatching ? [] : await this.getSentenceTimings(buffer, message);

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

            // Disabling this for now, not sure if it is safe
            // Suppress "interrupted at shutdown" errors often seen during tests
            // const err = error as { code?: number, message?: string }; // Safer cast
            // if (err.code === 11600 || (err.message && err.message.includes('interrupted at shutdown'))) {
            //     return;
            // }

            //Crash the client and report
            this.broadcaster.broadcastError('Error generating audio', 500);
            reportError("AudioSystem", "Error generating audio", error);
        }
    }

    async getSentenceTimings(buffer: Buffer, message: Message): Promise<any[]> {
        const openai = this.services.getOpenAI();
        const audioFile = new File([new Uint8Array(buffer)], "speech.mp3", { type: "audio/mpeg" });
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });
        return mapSentencesToWords(message.sentences, (transcription.words || []) as Word[]);
    }
}
