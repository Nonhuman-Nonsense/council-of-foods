import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { ProvidesReportContext, ReportContext } from "@interfaces/ReportContext.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import { CHAIR_ID, getChairMeetingVoice } from "@logic/characterSetupBundle.js";
import { Logger } from "@utils/Logger.js";
import { mapSentencesToWords, splitSentences, Word, type MappedSentence } from "@shared/textUtils.js";
import type { StoredMeeting, SubtitleTimingType } from "@models/DBModels.js";
import { parseBuffer } from 'music-metadata';
import {
    generateInworldAudio,
    generateElevenLabsAudio,
    generateOpenAIAudio,
    getWhisperWords,
    AudioResult
} from "./audio/TTSProviders.js";
import {
    AudioQueue,
    mergeAudioBuffers,
    splitTextForTts,
    prepareInworldTtsChunks,
} from "./audio/AudioUtils.js";
import { buildEstimatedSentenceTimings } from "./audio/EstimatedSubtitles.js";
import {
    AudioSystemOptions,
    Message,
    Services,
    Speaker
} from "./audio/AudioTypes.js";
import { validateSentenceTimingsAgainstDuration } from "./audio/SubtitleTimingValidation.js";
import type { AudioUpdatePayload } from "@shared/SocketTypes.js";

// Re-export types for compatibility
export * from "./audio/AudioTypes.js";
export * from "./audio/AudioUtils.js";

// All providers are chunked at 2000 chars even though ElevenLabs (~40k) and OpenAI (~2k tokens)
// allow larger inputs per request. Shorter chunks parallelise better and keep per-request
// synthesis latency down — longer messages noticeably slow down in practice.
const TTS_CHUNK_LIMIT = 2000;

const DEFAULT_SUBTITLE_TIMING_PRIORITIES: GlobalOptions["subtitleTimingPriorities"] = ['elevenlabs', 'inworld', 'estimated', 'whisper'];

export class AudioSystem {
    broadcaster: IMeetingBroadcaster;
    services: Services;
    queue: AudioQueue;
    private generationToken = 0;
    private readonly reportFrom?: ProvidesReportContext;

    constructor(
        broadcaster: IMeetingBroadcaster,
        services: Services,
        concurrency: number = 3,
        reportFrom?: ProvidesReportContext,
    ) {
        this.broadcaster = broadcaster;
        this.services = services;
        this.reportFrom = reportFrom;
        this.queue = new AudioQueue(concurrency, reportFrom);
    }

    /**
     * Report context for a specific audio task. The meeting being processed is the source of truth
     * for the id (the owning session's `reportFrom` may have been torn down mid-generation), while
     * still carrying the session's socketId for ErrorBot correlation.
     */
    private reportContextFor(meeting: StoredMeeting): ReportContext {
        return { meetingId: meeting._id, socketId: this.reportFrom?.getReportContext().socketId };
    }

    queueAudioGeneration(message: Message, speaker: Speaker, meeting: StoredMeeting, environment: string, serverOptions: GlobalOptions, skipMatching: boolean = false): void {
        this.queue.add(() =>
            this.generateAudio(message, speaker, meeting.language, serverOptions, meeting, environment, skipMatching, this.generationToken)
        );
    }

    async waitForIdle(): Promise<void> {
        await this.queue.onIdle();
    }

    cancelPendingWork(): void {
        this.generationToken++;
        this.queue.clearPending();
    }

    /**
     * Generates or retrieves audio for a given message.
     * Emits 'audio_update' to the socket client.
     */
    async generateAudio(
        message: Message,
        speaker: Speaker,
        language: string,
        serverOptions: GlobalOptions,
        meeting: StoredMeeting,
        environment: string,
        skipMatching: boolean = false,
        generationToken: number = this.generationToken
    ): Promise<void> {
        // Merge context language into options for consistent usage internally
        const effectiveOptions: AudioSystemOptions = { ...serverOptions, language };
        const from = this.reportContextFor(meeting);

        if (effectiveOptions.skipAudio) return;

        const resolvedSpeaker =
            speaker.id === serverOptions.chairId || speaker.id === CHAIR_ID
                ? { ...speaker, ...getChairMeetingVoice(language) }
                : speaker;

        if (message.type === "skipped") {
            if (generationToken !== this.generationToken) {
                return;
            }
            this.broadcaster.broadcastAudioUpdate({ id: message.id, type: "skipped" });
            return;
        }

        let buffers: Buffer[] = [];
        let generateNew = true;

        type LegacyAudioRow = {
            buffer?: Buffer | { buffer?: ArrayBufferLike };
            audio?: Buffer | { buffer?: ArrayBufferLike };
        };

        try {
            const existingAudio = await this.services.audioCollection.findOne({ _id: message.id });
            if (existingAudio) {
                const row = existingAudio as typeof existingAudio & LegacyAudioRow;
                let singleBuffer: Buffer | undefined;
                if (row.buffer && typeof row.buffer === "object" && "buffer" in row.buffer && row.buffer.buffer)
                    singleBuffer = Buffer.from(row.buffer.buffer);
                else if (row.audio && typeof row.audio === "object" && "buffer" in row.audio && row.audio.buffer)
                    singleBuffer = Buffer.from(row.audio.buffer);
                else singleBuffer = (row.buffer as Buffer | undefined) || (row.audio as Buffer | undefined);

                if (singleBuffer) {
                    buffers = [singleBuffer];
                    generateNew = false;
                }
            }
        } catch (error: unknown) {
            Logger.error("AudioSystem", `Error retrieving existing audio (message id: ${message.id})`, {
                error,
                from,
            });
        }


        try {
            const provider = resolvedSpeaker.voiceProvider;
            const chunkLimit = TTS_CHUNK_LIMIT;

            // For Inworld, run pronunciation processing on the full text before splitting so that
            // alias/IPA expansion is measured before chunk boundaries are chosen — preventing
            // post-split overflows past the API limit.
            // For other providers, split the raw text (no significant pre-send expansion).
            const isInworld = provider === 'inworld';
            let textChunks: string[];
            let inworldReplacedWords: Map<string, string> | undefined;

            if (isInworld) {
                const prepared = prepareInworldTtsChunks(message.text, effectiveOptions.language ?? 'en', chunkLimit);
                textChunks = prepared.chunks;
                inworldReplacedWords = prepared.replacedWords;
            } else {
                textChunks = splitTextForTts(message.text, chunkLimit);
            }

            if (textChunks.length > 1) {
                Logger.info("AudioSystem", `Message ${message.id} split into ${textChunks.length} chunks for TTS.`, { from });
            }

            let providerWords: (Word[] | undefined)[] = [];

            if (generateNew || buffers.length === 0) {
                Logger.info("AudioSystem", `Generating new audio for message ${message.id} (${resolvedSpeaker.voiceProvider}/${resolvedSpeaker.voice})`, { from });
                // Generate audio for all chunks in parallel
                const results = await Promise.all(textChunks.map(chunk =>
                    isInworld
                        ? this.generateProviderAudio(chunk, resolvedSpeaker, effectiveOptions, true, inworldReplacedWords)
                        : this.generateProviderAudio(chunk, resolvedSpeaker, effectiveOptions)
                ));
                buffers = results.map(r => r.audio);
                providerWords = results.map(r => r.words);
                generateNew = true;
            }

            if (generationToken !== this.generationToken) {
                return;
            }

            const shouldSkipMatching = skipMatching || effectiveOptions.skipMatchingSubtitles || environment === 'prototype';
            const sentenceTexts = this.getSentencesForTiming(message);

            let sentencesWithTimings: MappedSentence[] = [];
            let subtitleTimingType: SubtitleTimingType;

            const durations = shouldSkipMatching ? [] : await Promise.all(buffers.map(async b => this.getAudioDuration(b)));

            if (!shouldSkipMatching) {
                const subtitleTimingPriorities =
                    effectiveOptions.subtitleTimingPriorities ?? DEFAULT_SUBTITLE_TIMING_PRIORITIES;
                const conversationIndex = meeting.conversation?.findIndex(entry => entry.id === message.id) ?? -1;
                const speakerName =
                    resolvedSpeaker.name ??
                    meeting.characters.find(character => character.id === resolvedSpeaker.id)?.name ??
                    resolvedSpeaker.id;
                const meetingId = String(meeting._id);

                for (const timingType of subtitleTimingPriorities) {
                    if (timingType === 'inworld' && resolvedSpeaker.voiceProvider === 'inworld') {
                        const nativeSentences = this.getProviderSentenceTimings(providerWords, buffers, durations, sentenceTexts);
                        if (this.areSentenceTimingsUsable(nativeSentences, durations, timingType, meetingId, conversationIndex, speakerName, message.id)) {
                            sentencesWithTimings = nativeSentences;
                            subtitleTimingType = 'inworld';
                            break;
                        }
                    }

                    if (timingType === 'elevenlabs' && resolvedSpeaker.voiceProvider === 'elevenlabs') {
                        const nativeSentences = this.getProviderSentenceTimings(providerWords, buffers, durations, sentenceTexts);
                        if (this.areSentenceTimingsUsable(nativeSentences, durations, timingType, meetingId, conversationIndex, speakerName, message.id)) {
                            sentencesWithTimings = nativeSentences;
                            subtitleTimingType = 'elevenlabs';
                            break;
                        }
                    }

                    if (timingType === 'estimated') {
                        let totalDuration = durations.reduce((sum, duration) => sum + Math.max(duration, 0), 0);
                        if (totalDuration <= 0) {
                            totalDuration = await this.getAudioDurationFromBuffers(buffers);
                        }

                        const estimatedSentences = buildEstimatedSentenceTimings(message, totalDuration);
                        if (this.areSentenceTimingsUsable(estimatedSentences, [totalDuration], timingType, meetingId, conversationIndex, speakerName, message.id)) {
                            sentencesWithTimings = estimatedSentences;
                            subtitleTimingType = 'estimated';
                            break;
                        }
                    }

                    if (timingType === 'whisper') {
                        try {
                            const chunkWordsWithTimings = await Promise.all(buffers.map(b => this.getWhisperWordsWrapper(b)));
                            const whisperSentences = mapSentencesToWords(
                                sentenceTexts,
                                this.offsetChunkWords(chunkWordsWithTimings, durations)
                            );
                            if (this.areSentenceTimingsUsable(whisperSentences, durations, timingType, meetingId, conversationIndex, speakerName, message.id)) {
                                sentencesWithTimings = whisperSentences;
                                subtitleTimingType = 'whisper';
                                break;
                            }
                        } catch (error: unknown) {
                            Logger.warn("AudioSystem", `Whisper timings failed for message ${message.id}.`, {
                                error,
                                from,
                            });
                        }
                    }
                }
            } else {
                sentencesWithTimings = [];
            }

            if (generationToken !== this.generationToken) {
                return;
            }

            // Merge chunks into single buffer using FFmpeg
            const combinedBuffer = await mergeAudioBuffers(buffers);

            // Construct payload
            const audioObject: AudioUpdatePayload = {
                id: message.id,
                audio: combinedBuffer,
                sentences: sentencesWithTimings
            };

            Logger.info("AudioSystem", `Audio generated for message ${message.id}. Size: ${combinedBuffer.length} bytes.`, { from });

            if (generationToken !== this.generationToken) {
                return;
            }

            this.broadcaster.broadcastAudioUpdate(audioObject);

            if (generationToken !== this.generationToken) {
                return;
            }

            if (generateNew && environment !== "prototype") {
                // Upsert logic
                await this.services.audioCollection.updateOne(
                    { _id: audioObject.id },
                    {
                        $set: {
                            date: new Date().toISOString(),
                            meeting_id: meeting._id,
                            audio: combinedBuffer,
                            sentences: sentencesWithTimings,
                            subtitleTimingType: subtitleTimingType
                        }
                    },
                    { upsert: true }
                );
            }
            if (environment !== "prototype") {
                await this.services.meetingsCollection.updateOne(
                    { _id: meeting._id },
                    { $addToSet: { audio: audioObject.id } }
                );
            }

        } catch (error: unknown) {
            //Crash the client and report
            Logger.reportAndCrashClient("AudioSystem", "Error generating audio", {
                error,
                from,
                broadcaster: this.broadcaster,
            });
        }
    }

    private async generateProviderAudio(
        text: string,
        speaker: Speaker,
        options: AudioSystemOptions,
        preprocessed?: boolean,
        replacedWords?: Map<string, string>,
    ): Promise<AudioResult> {
        const baseParams = { text, speaker, options, preprocessed, replacedWords };

        if (speaker.voiceProvider === 'inworld') {
            return generateInworldAudio(baseParams);
        } else if (speaker.voiceProvider === 'elevenlabs') {
            return generateElevenLabsAudio(baseParams);
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
    async getSentenceTimings(buffer: Buffer, message: Message): Promise<MappedSentence[]> {
        const words = await this.getWhisperWordsWrapper(buffer);
        return mapSentencesToWords(this.getSentencesForTiming(message), words);
    }

    private async getAudioDuration(buffer: Buffer): Promise<number> {
        try {
            const metadata = await parseBuffer(
                buffer,
                { mimeType: "audio/ogg", size: buffer.length },
                { duration: true }
            );
            return metadata.format.duration || 0;
        } catch (error: unknown) {
            Logger.warn("AudioSystem", `Failed to parse audio duration`, { error, from: this.reportFrom });
            return 0;
        }
    }

    private async getAudioDurationFromBuffers(buffers: Buffer[]): Promise<number> {
        if (buffers.length === 0) {
            return 0;
        }

        if (buffers.length === 1) {
            return this.getAudioDuration(buffers[0]);
        }

        const combinedBuffer = await mergeAudioBuffers(buffers);
        return this.getAudioDuration(combinedBuffer);
    }

    private getProviderSentenceTimings(
        providerWords: (Word[] | undefined)[],
        buffers: Buffer[],
        durations: number[],
        sentenceTexts: string[]
    ): MappedSentence[] {
        const hasUsableNativeWords =
            providerWords.length === buffers.length &&
            providerWords.every(words => Array.isArray(words) && words.length > 0);

        if (!hasUsableNativeWords) {
            return [];
        }

        return mapSentencesToWords(
            sentenceTexts,
            this.offsetChunkWords(providerWords as Word[][], durations)
        );
    }

    private offsetChunkWords(chunkWordsWithTimings: Word[][], durations: number[]): Word[] {
        let currentOffset = 0;
        const allWords: Word[] = [];

        chunkWordsWithTimings.forEach((words, index) => {
            const offsetWords = words.map(word => ({
                ...word,
                start: word.start + currentOffset,
                end: word.end + currentOffset
            }));
            allWords.push(...offsetWords);

            const duration = durations[index];
            if (duration > 0) {
                currentOffset += duration;
            } else if (offsetWords.length > 0) {
                currentOffset = offsetWords[offsetWords.length - 1].end + 0.5;
            }
        });

        return allWords;
    }

    private areSentenceTimingsUsable(
        sentences: MappedSentence[],
        durations: number[],
        timingType: SubtitleTimingType,
        meetingId: string,
        conversationIndex: number,
        speakerName: string,
        messageId: string
    ): boolean {
        const totalDuration = durations.reduce((sum, duration) => sum + Math.max(duration, 0), 0);
        const validation = validateSentenceTimingsAgainstDuration(sentences, totalDuration);
        if (!validation.valid) {
            Logger.warn(
                "AudioSystem",
                `Rejected ${timingType ?? "unknown"} subtitle timings ` +
                `(index ${conversationIndex}, speaker ${speakerName}, message ${messageId}): ` +
                `${validation.reason}.`,
                { from: { meetingId: Number(meetingId) } },
            );
            return false;
        }
        return true;
    }

    private getSentencesForTiming(message: Message): string[] {
        return message.sentences.length > 0 ? message.sentences : splitSentences(message.text);
    }
}
