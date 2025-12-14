import { reportError } from "../../errorbot.js";
import { mapSentencesToWords } from "../utils/textUtils.js";
// OpenAI SDK accepts Buffer/Stream for 'file'.
// Using File object for compatibility.

export class AudioQueue {
    constructor(concurrency = 3) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = concurrency;
    }

    add(task) {
        this.queue.push(task);
        this.processNext();
    }

    async processNext() {
        if (this.activeCount >= this.concurrency || this.queue.length === 0) return;

        this.activeCount++;
        const task = this.queue.shift();

        try {
            // Start the task asynchronously
            this.runTask(task);

            // Try to start another task if concurrency allows
            this.processNext();
        } catch (error) {
            console.error("Error starting audio task:", error);
            // Should not happen if runTask handles it, but safety net.
            this.activeCount--;
        }
    }

    async runTask(task) {
        try {
            await task();
        } catch (error) {
            console.error("Error processing audio task:", error);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }
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
    constructor(socket, services, concurrency = 3) {
        this.socket = socket;
        this.services = services;
        this.queue = new AudioQueue(concurrency);
    }

    queueAudioGeneration(message, speaker, options, meetingId, environment) {
        this.queue.add(() => this.generateAudio(message, speaker, options, meetingId, environment));
    }

    /**
     * Generates or retrieves audio for a given message.
     * Emits 'audio_update' to the socket client.
     * 
     * @param {object} message - The message object containing text and id.
     * @param {object} speaker - The speaker object containing voice details.
     * @param {object} options - Configuration options (voiceModel, skipAudio, etc.).
     * @param {string} meetingId - The ID of the current meeting.
     * @param {string} environment - The runtime environment.
     * @param {boolean} skipMatching - Whether to skip sentence-level alignment.
     */
    async generateAudio(message, speaker, options, meetingId, environment, skipMatching = false) {
        if (options.skipAudio) return;

        if (message.type === "skipped") {
            this.socket.emit("audio_update", { id: message.id, type: "skipped" });
            return;
        }

        let buffer;
        let generateNew = true;
        try {
            const existingAudio = await this.services.audioCollection.findOne({ _id: message.id });
            if (existingAudio) {
                buffer = existingAudio.buffer;
                generateNew = false;
            }
        } catch (e) { console.log(e); }

        try {
            const openai = this.services.getOpenAI();
            if (generateNew) {
                const mp3 = await openai.audio.speech.create({
                    model: options.voiceModel,
                    voice: speaker.voice,
                    speed: options.audio_speed,
                    input: message.text.substring(0, 4096),
                });
                buffer = Buffer.from(await mp3.arrayBuffer());
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

        } catch (error) {
            // Suppress "interrupted at shutdown" errors often seen during tests
            if (error.code === 11600 || (error.message && error.message.includes('interrupted at shutdown'))) {
                return;
            }
            console.error("Error generating audio:", error);
            reportError(error);
        }
    }

    async getSentenceTimings(buffer, message) {
        const openai = this.services.getOpenAI();
        const audioFile = new File([buffer], "speech.mp3", { type: "audio/mpeg" });
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });
        return mapSentencesToWords(message.sentences, transcription.words);
    }
}
