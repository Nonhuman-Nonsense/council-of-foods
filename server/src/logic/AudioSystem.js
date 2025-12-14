import { reportError } from "../../errorbot.js";
import { mapSentencesToWords } from "../utils/textUtils.js";
import { File } from "buffer"; // Need File for OpenAI? Node's File is global in recent versions or requires polyfill/buffer.
// Actually OpenAI SDK accepts Buffer/Stream for 'file'. In original code: `new File([buffer], ...)` implies web-standard File.
// Node environment might need 'node-fetch' or similar if File is not present, but let's assume it works as it was in MeetingManager.
// Wait, `new File` is available in Node 20+. Current User environment is Mac, likely recent Node.
// If not, we might need: import { File } from "node:buffer"; (Node 20) or just pass ReadStream.
// Original code used `new File([buffer], "speech.mp3", { type: "audio/mpeg" });`
// I'll stick to what was there.

export class AudioQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    add(task) {
        this.queue.push(task);
        this.processNext();
    }

    async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const task = this.queue.shift();

        try {
            await task();
        } catch (error) {
            console.error("Error processing audio task:", error);
        } finally {
            this.processing = false;
            this.processNext();
        }
    }
}

export class AudioSystem {
    constructor(socket, services) {
        this.socket = socket;
        this.services = services;
        this.queue = new AudioQueue();
    }

    queueAudioGeneration(message, speaker, options, meetingId, environment) {
        this.queue.add(() => this.generateAudio(message, speaker, options, meetingId, environment));
    }

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
