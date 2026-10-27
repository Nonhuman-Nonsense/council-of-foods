import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from "@utils/Logger.js";
import { PronunciationUtils } from "@utils/PronunciationUtils.js";
import type { ProvidesReportContext } from "@interfaces/ReportContext.js";

export type AudioTask = () => Promise<void>;

export class AudioQueue {
    queue: AudioTask[];
    activeCount: number;
    concurrency: number;
    private idleResolvers: Array<() => void>;
    private readonly reportFrom?: ProvidesReportContext;

    constructor(concurrency: number = 3, reportFrom?: ProvidesReportContext) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = concurrency;
        this.idleResolvers = [];
        this.reportFrom = reportFrom;
    }

    add(task: AudioTask): void {
        this.queue.push(task);
        this.processNext();
    }

    clearPending(): void {
        this.queue = [];
        this.resolveIdleIfNeeded();
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
                Logger.error("AudioSystem", "Error starting audio task", { error, from: this.reportFrom });
                this.activeCount--;
            }
        }
    }

    async runTask(task: AudioTask): Promise<void> {
        try {
            await task();
        } catch (error) {
            //This block will catch asynchronous errors
            Logger.error("AudioSystem", "Audio Task Error", { error, from: this.reportFrom });
        } finally {
            this.activeCount--;
            this.resolveIdleIfNeeded();
            this.processNext();
        }
    }

    async onIdle(): Promise<void> {
        if (this.activeCount === 0 && this.queue.length === 0) {
            return;
        }

        await new Promise<void>((resolve) => {
            this.idleResolvers.push(resolve);
        });
    }

    private resolveIdleIfNeeded(): void {
        if (this.activeCount !== 0 || this.queue.length !== 0) {
            return;
        }

        const resolvers = this.idleResolvers.splice(0);
        for (const resolve of resolvers) {
            resolve();
        }
    }
}

/**
 * Merges multiple audio buffers into a single buffer using FFmpeg.
 * Uses the concat demuxer for lossless concatenation of audio files.
 * 
 * @param buffers - Array of audio buffers to merge (OGG, MP3, etc.)
 * @returns Single merged audio buffer
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

/** Where a message's voice is brought to, so every being speaks at the same perceived level. */
export interface LoudnessTarget {
    /** Integrated loudness (EBU R128) every message is brought to. */
    targetLufs: number;
    /** Corrections smaller than this many dB are left alone: the message is passed through untouched. */
    skipBelowDb: number;
    /** Ceiling for peaks after the gain, so a boosted quiet take cannot clip. */
    truePeakDb: number;
}

export interface LoudnessResult {
    audio: Buffer;
    /** Integrated loudness of the audio as it came from the provider; null if it held no measurable speech. */
    measuredLufs: number | null;
    /** Gain applied to the whole message; 0 when it was within `skipBelowDb` of the target. */
    gainDb: number;
}

/** Quieter than this is silence or near it: there is no speech level to correct. */
const SILENCE_LUFS = -60;

function runFfmpeg(args: string[], input?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
    if (!ffmpegPath) {
        return Promise.reject(new Error('FFmpeg binary not found'));
    }
    return new Promise((resolve, reject) => {
        const ffmpegProcess = spawn(ffmpegPath as unknown as string, args);
        const stdout: Buffer[] = [];
        let stderr = '';

        ffmpegProcess.stdout.on('data', (data: Buffer) => stdout.push(data));
        ffmpegProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout: Buffer.concat(stdout), stderr });
            } else {
                reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
            }
        });
        ffmpegProcess.on('error', (err) => {
            reject(new Error(`Failed to start FFmpeg process: ${err.message}`));
        });
        // ffmpeg may stop reading early once it has failed; the exit code reports that, not EPIPE.
        ffmpegProcess.stdin.on('error', () => {});
        ffmpegProcess.stdin.end(input);
    });
}

/** Integrated loudness (LUFS, EBU R128) of an OGG/Opus buffer, or null when it is silent. */
export async function measureLoudness(buffer: Buffer): Promise<number | null> {
    const { stderr } = await runFfmpeg([
        '-hide_banner', '-nostats',
        '-i', 'pipe:0',
        '-af', 'ebur128=framelog=quiet',
        '-f', 'null', '-',
    ], buffer);
    // The summary comes last; its "I:" line is the integrated loudness of the whole input.
    const matches = [...stderr.matchAll(/^\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/gm)];
    const value = Number(matches.at(-1)?.[1]);
    if (!Number.isFinite(value) || value < SILENCE_LUFS) return null;
    return value;
}

/**
 * Brings a whole message to `target.targetLufs` with one fixed gain, so its own dynamics — a
 * whisper, a closing grunt — keep their place relative to the speech around them. A limiter
 * catches the peaks a boost would push past `target.truePeakDb`; it only ever turns down.
 *
 * Only OGG/Opus is touched (every provider returns it). Anything else, silence, and corrections
 * under `target.skipBelowDb` come back as the same buffer, without a re-encode.
 */
export async function normalizeLoudness(buffer: Buffer, target: LoudnessTarget): Promise<LoudnessResult> {
    if (buffer.subarray(0, 4).toString('latin1') !== 'OggS') {
        return { audio: buffer, measuredLufs: null, gainDb: 0 };
    }

    const measuredLufs = await measureLoudness(buffer);
    if (measuredLufs === null) {
        return { audio: buffer, measuredLufs, gainDb: 0 };
    }

    const gainDb = Math.round((target.targetLufs - measuredLufs) * 10) / 10;
    if (Math.abs(gainDb) < target.skipBelowDb) {
        return { audio: buffer, measuredLufs, gainDb: 0 };
    }

    const limit = Math.pow(10, target.truePeakDb / 20).toFixed(4);
    const { stdout } = await runFfmpeg([
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0',
        // latency=1 compensates the limiter's lookahead, so subtitle timings stay put.
        '-af', `volume=${gainDb}dB,alimiter=limit=${limit}:level=false:latency=1`,
        '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '128k',
        '-f', 'ogg', 'pipe:1',
    ], buffer);
    return { audio: stdout, measuredLufs, gainDb };
}

/**
 * Splits text into the minimum number of chunks each fitting within `limit`,
 * preferring the latest natural boundary (paragraph > line > sentence > clause)
 * over balanced sizes. This minimises the number of audible seams.
 */
export function splitTextForTts(text: string, limit: number): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > limit) {
        const separators = ['\n\n', '\n', '. ', ', '];
        let splitIndex = -1;

        for (const sep of separators) {
            // Find the LAST occurrence at or before the limit.
            const searchRegion = remaining.substring(0, limit + sep.length);
            const idx = searchRegion.lastIndexOf(sep);
            if (idx !== -1 && idx <= limit) {
                // Keep the separator attached to the left chunk (include period, keep newlines).
                splitIndex = idx + (sep === '. ' ? 2 : sep === ', ' ? 1 : sep.length);
                break;
            }
        }

        if (splitIndex <= 0) {
            // No natural boundary found — hard cut at limit.
            splitIndex = limit;
        }

        chunks.push(remaining.substring(0, splitIndex).trimEnd());
        remaining = remaining.substring(splitIndex).trimStart();
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}

/**
 * Prepares Inworld TTS chunks for a message:
 * 1. Runs pronunciation processing (aliases + IPA) on the *full* text so that
 *    expansion is measured before splitting — preventing post-split overflows.
 * 2. Splits the processed text using splitTextForTts.
 *
 * Returns the chunks ready to send to the API, plus the replacedWords map needed
 * for subtitle restoration (built once from the full text).
 */
export function prepareInworldTtsChunks(
    text: string,
    language: string,
    limit: number = 2000,
): { chunks: string[]; replacedWords: Map<string, string> } {
    const { processedText, replacedWords } = PronunciationUtils.processText(
        text,
        language,
        { includeIpa: true },
    );
    const chunks = splitTextForTts(processedText, limit);
    return { chunks, replacedWords };
}

