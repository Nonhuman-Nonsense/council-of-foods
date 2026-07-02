import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from "@utils/Logger.js";
import { PronunciationUtils } from "@utils/PronunciationUtils.js";

export type AudioTask = () => Promise<void>;

export class AudioQueue {
    queue: AudioTask[];
    activeCount: number;
    concurrency: number;
    private idleResolvers: Array<() => void>;

    constructor(concurrency: number = 3) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = concurrency;
        this.idleResolvers = [];
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

