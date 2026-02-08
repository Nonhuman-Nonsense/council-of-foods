import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the mergeAudioBuffers function directly to test it
// We'll dynamically import the module to access the private function
// Import directly from the new utility file
import { mergeAudioBuffers, splitText } from '@root/src/logic/audio/AudioUtils.js';

// Mock music-metadata
vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 2.5 }
    })
}));

describe('AudioUtils: Splitting Text', () => {
    it('should split long text into smaller chunks based on limit', () => {
        const longText = 'A'.repeat(3000);
        const limit = 2000;
        const chunks = splitText(longText, limit);
        expect(chunks.length).toBeGreaterThan(1);
        chunks.forEach(chunk => {
            expect(chunk.length).toBeLessThanOrEqual(limit);
        });
    });

    it('should respect semantic boundaries (paragraphs) when splitting', () => {
        const part1 = 'First part.\n\n';
        const part2 = 'Second part.';
        const combined = part1 + part2;
        // Force split by setting limit smaller than combined length but larger than parts
        const limit = part1.length + 1;

        // This test case depends on splitText logic preferring \n\n
        const chunks = splitText(combined, limit);

        // With current logic, it should look for \n\n. 
        // If the limit cuts into part2, it should backtrack to \n\n.
        // Let's rely on the property that chunks are valid.
        expect(chunks).toContain(part1.trim());
    });

    it('should split balanced chunks (approx 1500 chars) for 3000 chars input with 2000 limit', () => {
        // Create a text with sentence boundaries every 100 chars
        let text = '';
        const sentence = 'A'.repeat(98) + '. ';
        for (let i = 0; i < 30; i++) {
            text += sentence;
        }
        // Total length = 30 * 100 = 3000
        const limit = 2000;

        const chunks = splitText(text, limit);
        expect(chunks.length).toBe(2);

        // Ideal split is 1500 / 1500
        // Acceptable range: 1300 - 1700 to allow for sentence boundary finding
        expect(chunks[0].length).toBeGreaterThan(1300);
        expect(chunks[0].length).toBeLessThan(1700);

        expect(chunks[1].length).toBeGreaterThan(1300);
        expect(chunks[1].length).toBeLessThan(1700);
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

