import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the mergeAudioBuffers function directly to test it
// We'll dynamically import the module to access the private function
// Import directly from the new utility file
import { AudioQueue, mergeAudioBuffers, splitTextForTts, prepareInworldTtsChunks } from '@root/src/logic/audio/AudioUtils.js';
import { Logger } from '@utils/Logger.js';

// Mock music-metadata
vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 2.5 }
    })
}));


describe('AudioUtils: splitTextForTts', () => {
    const LIMIT = 100; // small limit for easy assertions

    it('returns single-element array when text fits within limit', () => {
        const text = 'Short text.';
        expect(splitTextForTts(text, LIMIT)).toEqual([text]);
    });

    it('never produces a chunk longer than the limit', () => {
        const text = 'A'.repeat(350);
        const chunks = splitTextForTts(text, LIMIT);
        chunks.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(LIMIT));
    });

    it('prefers paragraph boundary (\\n\\n) as the latest split point', () => {
        // Two paragraphs; second para starts before the limit, first ends with \n\n
        const para1 = 'First paragraph content here.';
        const para2 = 'Second paragraph goes here.';
        const gap = '\n\n';
        const text = para1 + gap + para2;
        const limit = para1.length + gap.length + 10; // para2 would overflow if we add more
        const longPara2 = para2 + ' '.repeat(limit + 10);
        const fullText = para1 + gap + longPara2;

        const chunks = splitTextForTts(fullText, limit);
        expect(chunks[0]).toBe(para1);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('falls back to line boundary (\\n) when no \\n\\n fits', () => {
        const line1 = 'First line of content.';
        const line2 = 'Second line of content which is very long.';
        const text = line1 + '\n' + line2 + 'X'.repeat(100);
        const limit = line1.length + 1 + 5; // just past the \n separator

        const chunks = splitTextForTts(text, limit);
        expect(chunks[0]).toBe(line1);
    });

    it('falls back to sentence boundary (. ) when no newlines fit', () => {
        const s1 = 'Hello world.';
        const s2 = ' How are you doing today exactly.';
        const text = s1 + s2 + 'X'.repeat(100);
        const limit = s1.length + 5;

        const chunks = splitTextForTts(text, limit);
        expect(chunks[0]).toBe(s1);
    });

    it('falls back to comma boundary (, ) when no stronger boundary fits', () => {
        const part1 = 'One thing';
        const part2 = ' another thing and more text here.';
        const text = part1 + ',' + part2 + 'X'.repeat(100);
        const limit = part1.length + 1 + 5;

        const chunks = splitTextForTts(text, limit);
        expect(chunks[0]).toBe(part1 + ',');
    });

    it('hard-splits at limit when no boundary is found', () => {
        const text = 'A'.repeat(250);
        const chunks = splitTextForTts(text, LIMIT);
        expect(chunks.length).toBe(3);
        chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(LIMIT));
    });

    it('produces minimum chunk count (greedy: latest boundary wins)', () => {
        // 20 sentences of 50 chars each = 1000 chars total; limit = 600
        // Greedy/latest: first chunk should contain sentences up to just under 600
        const sentence = 'A'.repeat(48) + '. ';
        const text = sentence.repeat(20);
        const limit = 600;

        const chunks = splitTextForTts(text, limit);
        // With greedy/latest packing we expect 2 chunks (could fit in 2 x ~500)
        expect(chunks.length).toBe(2);
        chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(limit));
    });
});

describe('AudioUtils: prepareInworldTtsChunks', () => {
    it('every chunk is within the default 2000-char limit', () => {
        // Alias-heavy text: CO₂ expands to "see oh two", kWh → "kilowatt hours", etc.
        const base = 'CO₂ emissions and kWh usage. ';
        const text = base.repeat(80); // well over 2000 chars after expansion

        const { chunks } = prepareInworldTtsChunks(text, 'en');
        expect(chunks.length).toBeGreaterThan(0);
        chunks.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(2000));
    });

    it('returns a single chunk for short text', () => {
        const text = 'A short sentence about CO₂.';
        const { chunks } = prepareInworldTtsChunks(text, 'en');
        expect(chunks).toHaveLength(1);
    });

    it('builds replacedWords map from the full text', () => {
        const text = 'We measure CO₂ levels and more CO₂ data.';
        const { replacedWords } = prepareInworldTtsChunks(text, 'en');
        // Should have at least one entry mapping expanded form back to original
        expect(replacedWords.size).toBeGreaterThan(0);
    });

    it('custom limit is respected', () => {
        const text = 'Hello world. '.repeat(100);
        const { chunks } = prepareInworldTtsChunks(text, 'en', 200);
        chunks.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(200));
    });
});

describe('AudioQueue: error reporting', () => {
    it('attaches the owning session as report context on a task error', async () => {
        const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(async () => {});
        const reportFrom = { getReportContext: () => ({ meetingId: 42, socketId: 'sock-1' }) };
        const queue = new AudioQueue(1, reportFrom);

        queue.add(() => Promise.reject(new Error('boom')));
        await queue.onIdle();

        expect(errorSpy).toHaveBeenCalledWith(
            'AudioSystem',
            'Audio Task Error',
            expect.objectContaining({ from: reportFrom }),
        );
        errorSpy.mockRestore();
    });

    it('logs without a report context when none was provided', async () => {
        const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(async () => {});
        const queue = new AudioQueue(1);

        queue.add(() => Promise.reject(new Error('boom')));
        await queue.onIdle();

        expect(errorSpy).toHaveBeenCalledWith(
            'AudioSystem',
            'Audio Task Error',
            expect.objectContaining({ from: undefined }),
        );
        errorSpy.mockRestore();
    });
});

describe('AudioUtils: FFmpeg Audio Merging', () => {
    let fixture1: Buffer;
    let fixture2: Buffer;
    let fixture3: Buffer;

    beforeEach(async () => {
        // Load real OGG/OPUS test fixtures
        const fixturesDir = path.join(__dirname, 'fixtures');
        fixture1 = await fs.readFile(path.join(fixturesDir, 'test-chunk-1.ogg'));
        fixture2 = await fs.readFile(path.join(fixturesDir, 'test-chunk-2.ogg'));
        fixture3 = await fs.readFile(path.join(fixturesDir, 'test-chunk-3.ogg'));
    });

    it('should merge two real OGG/OPUS files into one valid audio file', async () => {
        const mergedBuffer = await mergeAudioBuffers([fixture1, fixture2]);
        expect(mergedBuffer.length).toBeGreaterThan(0);
        expect(mergedBuffer.length).toBeGreaterThan(fixture1.length);
        console.log(`Merged file size: ${mergedBuffer.length} bytes (input1: ${fixture1.length}, input2: ${fixture2.length})`);
    });

    it('should merge three real OGG/OPUS files', async () => {
        const mergedBuffer = await mergeAudioBuffers([fixture1, fixture2, fixture3]);
        expect(mergedBuffer.length).toBeGreaterThan(0);
        console.log(`Merged 3 files: ${mergedBuffer.length} bytes`);
    });
});

