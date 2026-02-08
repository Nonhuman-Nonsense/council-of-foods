import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from "@utils/Logger.js";
import { GOOGLE_LANGUAGE_MAP } from "@shared/AvailableLanguages.js";

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

export function getGoogleLanguageCode(appLang?: string): string {
    if (!appLang) return 'en-GB';
    return GOOGLE_LANGUAGE_MAP[appLang] || 'en-GB';
}

export function splitText(text: string, limit: number): string[] {
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
