import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the mergeAudioBuffers function directly to test it
// We'll dynamically import the module to access the private function
import { AudioSystem, mergeAudioBuffers } from '@root/src/logic/AudioSystem.js';

// Mock music-metadata
vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 2.5 }
    })
}));

describe('FFmpeg Audio Merging with Real Files', () => {
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

