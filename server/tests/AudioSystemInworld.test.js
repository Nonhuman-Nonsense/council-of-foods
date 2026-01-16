
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';
import { Logger } from '@root/src/utils/Logger.js';

vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

vi.mock('@root/src/logic/GlobalOptions.js', () => ({
    GlobalOptionsSchema: {},
    getGlobalOptions: vi.fn(() => ({
        inworldVoiceModel: 'inworld-tts-1',
        audio_speed: 1.0
    }))
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AudioSystem Inworld Integration', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;

    beforeEach(() => {
        vi.clearAllMocks();

        // Set API Key (mock)
        process.env.INWORLD_API_KEY = "mock-api-key";

        mockBroadcaster = {
            broadcastAudioUpdate: vi.fn(),
            broadcastError: vi.fn()
        };

        const mockOpenAI = {
            audio: {
                transcriptions: {
                    create: vi.fn().mockResolvedValue({ words: [] })
                }
            }
        };

        mockServices = {
            audioCollection: {
                findOne: vi.fn(),
                updateOne: vi.fn()
            },
            meetingsCollection: {
                updateOne: vi.fn()
            },
            getOpenAI: vi.fn(() => mockOpenAI)
        };

        audioSystem = new AudioSystem(mockBroadcaster, mockServices);
    });

    afterEach(() => {
        vi.resetModules();
        delete process.env.INWORLD_API_KEY;
    });

    it('should call Inworld API when voiceProvider is inworld', async () => {
        const message = { id: 'msg1', text: 'Hello Inworld', sentences: ['Hello Inworld'] };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };
        // We pass GlobalOptions explicitly or rely on resolved options in context.
        // But tests for generateAudio typically mock context.
        const context = { options: { audio_speed: 1.2, inworldVoiceModel: 'inworld-tts-1' } };
        const meetingId = 123;
        const environment = 'production';

        const mockAudioContent = Buffer.from('fake-inworld-audio').toString('base64');
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: mockAudioContent }),
            text: async () => ''
        });

        await audioSystem.generateAudio(message, speaker, context, meetingId, environment);

        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.inworld.ai/tts/v1/voice',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Basic mock-api-key',
                    'Content-Type': 'application/json'
                }),
                body: expect.stringContaining('"voice_id":"Dennis"')
            })
        );

        // Check body content for model and speed
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.model_id).toBe('inworld-tts-1'); // Default from mock
        expect(body.audio_config.speaking_rate).toBe(1.2); // Overridden by context
    });

    it('should use Whisper for timings (Phase 1)', async () => {
        const message = { id: 'msg2', text: 'Timing Test', sentences: ['Timing Test'] };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };
        const context = { options: { audio_speed: 1.0, inworldVoiceModel: 'inworld-tts-1' } };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: Buffer.from('audio').toString('base64') }),
        });

        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        const openai = mockServices.getOpenAI();
        expect(openai.audio.transcriptions.create).toHaveBeenCalled();
    });

    it('should report error on non-ok Inworld API response', async () => {
        const message = { id: 'msgErr', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };

        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });

        await audioSystem.generateAudio(message, speaker, { options: { audio_speed: 1.0, inworldVoiceModel: 'inworld-tts-1' } }, 123, 'production');

        expect(Logger.reportAndCrashClient).toHaveBeenCalledWith(
            'AudioSystem',
            'Error generating audio',
            expect.objectContaining({ message: expect.stringContaining('Inworld TTS API Error: 500 Internal Server Error') }),
            expect.anything()
        );
    });
});
