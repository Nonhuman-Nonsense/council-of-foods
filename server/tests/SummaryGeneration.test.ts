import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Mock music-metadata
vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 10 } // Each chunk is 10 seconds
    })
}));

import { AudioSystem } from '../src/logic/AudioSystem.js'; // Adjust path if needed, assuming processed by ts-node/vitest
import fs from 'fs';
import path from 'path';

// Mock Logger to capture crashes
vi.mock('../src/utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

import { Logger } from '../src/utils/Logger.js';

// Global mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Inworld TTS Summary Generation Limit', () => {
    let audioSystem: any;
    let mockBroadcaster: any;
    let mockServices: any;
    let globalOptions: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Load real global options
        const optionsPath = path.resolve(__dirname, '../global-options.json');
        globalOptions = JSON.parse(fs.readFileSync(optionsPath, 'utf-8'));

        process.env.INWORLD_API_KEY = "mock-api-key";

        mockBroadcaster = {
            broadcastAudioUpdate: vi.fn(),
            broadcastError: vi.fn(),
            broadcastMeetingStarted: vi.fn(),
            broadcastConversationUpdate: vi.fn(),
            broadcastConversationEnd: vi.fn(),
            broadcastClientKey: vi.fn(),
            broadcastWarning: vi.fn(),
            broadcastSpeakerUpdate: vi.fn()
        };

        const mockOpenAI = {
            audio: {
                speech: {
                    create: vi.fn().mockResolvedValue({ arrayBuffer: () => Buffer.from('openai-audio') })
                },
                transcriptions: {
                    create: vi.fn().mockResolvedValue({ words: [] })
                }
            }
        };

        mockServices = {
            audioCollection: { findOne: vi.fn(), updateOne: vi.fn() },
            meetingsCollection: { updateOne: vi.fn() },
            getOpenAI: vi.fn(() => mockOpenAI)
        };

        audioSystem = new AudioSystem(mockBroadcaster, mockServices);
    });

    afterEach(() => {
        delete process.env.INWORLD_API_KEY;
    });

    it('should SUCCEED with long summary: split → parallel generation → FFmpeg merge → single output', async () => {
        // Load real OGG test fixtures
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const fs = await import('fs/promises');
        const fixturesDir = path.join(__dirname, 'fixtures');
        const fixture1 = await fs.readFile(path.join(fixturesDir, 'test-chunk-1.ogg'));
        const fixture2 = await fs.readFile(path.join(fixturesDir, 'test-chunk-2.ogg'));

        // 1. Create long summary text that will trigger chunking (>2000 chars)
        const longSummary = 'This is a summary. '.repeat(120); // ~2400 chars
        const message = {
            id: 'summary-msg-123',
            text: longSummary,
            sentences: [] // Summaries don't have sentences
        };

        const speaker = {
            id: 'summary-char',
            voice: 'Wendy',
            voiceProvider: 'inworld'
        };

        const context = {
            options: {
                inworldVoiceModel: globalOptions.inworldVoiceModel,
                audio_speed: 1.0,
                skipMatchingSubtitles: true // Summaries don't need subtitle timings
            }
        };

        // 2. Mock Inworld API to return our real fixtures
        let callCount = 0;
        const mockFetch = vi.fn().mockImplementation(async (url, init) => {
            if (url.includes('inworld.ai')) {
                const body = JSON.parse(init.body);

                // Verify text is under limit
                expect(body.text.length).toBeLessThanOrEqual(2000);

                callCount++;
                // Alternate between fixtures for different chunks
                const fixture = callCount === 1 ? fixture1 : fixture2;
                const audioContent = fixture.toString('base64');

                return {
                    ok: true,
                    json: async () => ({ audioContent })
                };
            }
            return { ok: true };
        });
        global.fetch = mockFetch;

        // 3. Run generateAudio
        await audioSystem.generateAudio(message, speaker, context, 12, 'production');

        // 4. Verify the flow
        // Multiple chunks were generated (text was split)
        expect(callCount).toBeGreaterThan(1);
        expect(mockFetch).toHaveBeenCalledTimes(callCount);

        // No errors during FFmpeg merging
        expect(Logger.reportAndCrashClient).not.toHaveBeenCalled();

        // Single audio message was broadcast
        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledTimes(1);

        const broadcastCall = mockBroadcaster.broadcastAudioUpdate.mock.calls[0][0];
        expect(broadcastCall).toMatchObject({
            id: 'summary-msg-123',
            audio: expect.any(Buffer)
        });

        // Merged audio is larger than a single fixture (proves merging happened)
        const mergedAudio = broadcastCall.audio;
        expect(mergedAudio.length).toBeGreaterThan(fixture1.length);
        expect(mergedAudio.length).toBeGreaterThan(0);

        console.log(`✓ Summary test: ${callCount} chunks merged into ${mergedAudio.length} bytes`);
    });
});
