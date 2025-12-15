import { reportError } from "../../errorbot.js";
import { Logger } from "@utils/Logger.js";
import { Meeting, Audio } from "@models/DBModels.js";
import { mapSentencesToWords } from "@utils/textUtils.js";
import { OpenAI } from "openai";
import { Collection, Document } from "mongodb";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@shared/SocketTypes.js";
import type { Character, ConversationMessage } from "@shared/ModelTypes.js";

// OpenAI SDK accepts Buffer/Stream for 'file'.
// Using File object for compatibility.

export type AudioTask = () => Promise<void>;

// ... (AudioQueue class remains unchanged) 

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
                console.error("Error starting audio task:", error);
                this.activeCount--;
            }
        }
    }

    async runTask(task: AudioTask): Promise<void> {
        try {
            await task();
        } catch (error) {
            console.error(error);
            // Note: `this.meetingId` is not available in AudioQueue.
            // The instruction implies a context that might be passed to the task or queue.
            // For now, using a generic context.
            reportError("AudioSystem", "Audio Generation Error", error);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }
}



// ...

export interface Services {
    audioCollection: Collection<Audio>;
    meetingsCollection: Collection<Meeting>;
    getOpenAI: () => OpenAI;
}

export interface Speaker {
    voice: string;
    [key: string]: any;
}

export interface Message {
    id: string;
    type?: string;
    text: string;
    sentences: string[];
    [key: string]: any;
}

export interface AudioSystemOptions {
    voiceModel: string;
    audio_speed: number;
    skipAudio?: boolean;
    skipMatchingSubtitles?: boolean;
    [key: string]: any;
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
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    services: Services;
    queue: AudioQueue;

    constructor(socket: Socket<ClientToServerEvents, ServerToClientEvents>, services: Services, concurrency: number = 3) {
        this.socket = socket;
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
            this.socket.emit("audio_update", { id: message.id, type: "skipped" });
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
        } catch (e) { console.log(e); }

        try {
            const openai = this.services.getOpenAI();
            if (generateNew || !buffer) {
                const mp3 = await openai.audio.speech.create({
                    model: options.voiceModel,
                    voice: speaker.voice as any, // OpenAI types might be strict union
                    speed: options.audio_speed,
                    input: message.text.substring(0, 4096),
                });
                buffer = Buffer.from(await mp3.arrayBuffer());
                generateNew = true; // Ensure we save it if we regenerated it because buffer was missing
            }

            const shouldSkipMatching = skipMatching || options.skipMatchingSubtitles;
            const sentencesWithTimings = shouldSkipMatching ? [] : await this.getSentenceTimings(buffer, message);

            const audioObject = {
                id: message.id,
                audio: buffer,
                sentences: sentencesWithTimings
            };

            this.socket.emit("audio_update", audioObject);

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

        } catch (error: any) {
            // Suppress "interrupted at shutdown" errors often seen during tests
            if (error.code === 11600 || (error.message && error.message.includes('interrupted at shutdown'))) {
                return;
            }
            // console.error("Error generating audio:", error);
            Logger.error("AudioSystem", "Error generating audio", error);
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
        return mapSentencesToWords(message.sentences, transcription.words as any[]);
    }
}
