
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';
import { Logger } from '@root/src/utils/Logger.js';

vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 1 }
    })
}));

vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

// Mock dependencies
const mockGetAccessToken = vi.fn();
const mockGetClient = vi.fn();
const mockGoogleAuthConstructor = vi.fn();

vi.mock('google-auth-library', () => {
    return {
        GoogleAuth: class {
            constructor(options) {
                mockGoogleAuthConstructor(options);
            }
            getClient() {
                return mockGetClient();
            }
        }
    };
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AudioSystem Gemini Integration', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;

    beforeEach(() => {
        vi.clearAllMocks();

        mockBroadcaster = {
            broadcastAudioUpdate: vi.fn(),
            broadcastError: vi.fn()
        };

        mockServices = {
            audioCollection: {
                findOne: vi.fn(),
                updateOne: vi.fn()
            },
            meetingsCollection: {
                updateOne: vi.fn()
            },
            getOpenAI: vi.fn(() => ({
                audio: {
                    transcriptions: {
                        create: vi.fn().mockResolvedValue({ words: [] })
                    }
                }
            }))
        };

        // Setup successful auth mock
        mockGetAccessToken.mockResolvedValue({ token: 'mock-token-123' });
        mockGetClient.mockResolvedValue({
            getAccessToken: mockGetAccessToken
        });

        audioSystem = new AudioSystem(mockBroadcaster, mockServices);
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('should use GoogleAuth and Gemini Flash model when voiceProvider is gemini', async () => {
        const message = { id: 'msg1', text: 'Hello Gemini', sentences: ['Hello Gemini'] };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };

        // Context object
        const context = {
            options: {
                voiceModel: 'tts-1',
                geminiVoiceModel: 'gemini-2.5-flash-tts',
                audio_speed: 1.25 // speed is inside options
            },
            language: 'sv' // language is outside options
        };

        const meetingId = 123;
        const environment = 'production';

        // Mock successful fetch response
        const mockAudioContent = Buffer.from('fake-audio').toString('base64');
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: mockAudioContent }),
            text: async () => ''
        });

        await audioSystem.generateAudio(message, speaker, context, meetingId, environment);

        // Verify GoogleAuth usage
        expect(mockGoogleAuthConstructor).toHaveBeenCalledWith(expect.objectContaining({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        }));

        // Verify API call parameters
        expect(mockFetch).toHaveBeenCalledWith(
            'https://texttospeech.googleapis.com/v1/text:synthesize',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"model_name":"gemini-2.5-flash-tts"')
            })
        );

        // Verify Audio Speed (speakingRate)
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"speakingRate":1.25')
            })
        );

        // Verify Language Mapping (sv -> sv-SE)
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"languageCode":"sv-SE"')
            })
        );
    });

    it('should default to en-GB if language is missing', async () => {
        const message = { id: 'msg2', text: 'Hello', sentences: ['Hello'] };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };
        const context = {
            options: { geminiVoiceModel: 'gemini-flash', audio_speed: 1 }
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' }),
        });

        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"languageCode":"en-GB"')
            })
        );
    });

    it('should reuse cached GoogleAuth client on subsequent calls', async () => {
        const message = { id: 'msg3', text: 'Hello again', sentences: ['Hello again'] };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };
        const context = {
            options: { geminiVoiceModel: 'gemini-flash', audio_speed: 1 }
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' }),
        });

        // First Call
        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        // Second Call
        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        // Constructor should be called ONLY ONCE
        expect(mockGoogleAuthConstructor).toHaveBeenCalledTimes(1);

        // Internal methods called twice
        expect(mockGetClient).toHaveBeenCalledTimes(2);
    });

    it('should prioritize character voiceLocale over global language IF language is en', async () => {
        const message = { id: 'msg4', text: 'Hello Mate', sentences: ['Hello Mate'] };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini', voiceLocale: 'en-AU' }; // Aussie override
        const context = {
            options: { geminiVoiceModel: 'gemini-flash', audio_speed: 1 },
            language: 'en'
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' }),
        });

        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"languageCode":"en-AU"')
            })
        );
    });

    it('should IGNORE character voiceLocale if global language is not en', async () => {
        const message = { id: 'msg5', text: 'Hej', sentences: ['Hej'] };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini', voiceLocale: 'en-AU' }; // Stray persisted setting
        const context = {
            options: { geminiVoiceModel: 'gemini-flash', audio_speed: 1 },
            language: 'sv' // Swedish
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' }),
        });

        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        // Should be sv-SE (default for sv), NOT en-AU
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"languageCode":"sv-SE"')
            })
        );
    });
    it('should include voice instruction in prompt if provided', async () => {
        const message = { id: 'msgPrompt', text: 'Hello', sentences: ['Hello'] };
        const speaker = {
            id: 'char1',
            voice: 'Kore',
            voiceProvider: 'gemini',
            voiceInstruction: 'Speak curiously'
        };
        const context = {
            options: { geminiVoiceModel: 'gemini-flash', audio_speed: 1 }
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' }),
        });

        await audioSystem.generateAudio(message, speaker, context, 123, 'production');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"prompt":"Speak curiously"')
            })
        );
    });

    it('should report error on non-ok API response', async () => {
        const message = { id: 'msgErr', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };

        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => 'Bad Request'
        });

        await audioSystem.generateAudio(message, speaker, { options: {} }, 123, 'production');

        expect(Logger.reportAndCrashClient).toHaveBeenCalledWith(
            'AudioSystem',
            'Error generating audio',
            expect.objectContaining({ message: expect.stringContaining('Google TTS API Error: 400 Bad Request') }),
            expect.anything()
        );
    });

    it('should report error if audioContent is missing', async () => {
        const message = { id: 'msgEmpty', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({}) // Empty object
        });

        await audioSystem.generateAudio(message, speaker, { options: {} }, 123, 'production');

        expect(Logger.reportAndCrashClient).toHaveBeenCalledWith(
            'AudioSystem',
            'Error generating audio',
            expect.objectContaining({ message: expect.stringContaining('No audio content returned from Google TTS') }),
            expect.anything()
        );
    });

    it('should truncate input text to 4096 characters', async () => {
        const longText = 'a'.repeat(5000);
        const message = { id: 'msgLong', text: longText };
        const speaker = { id: 'char1', voice: 'Kore', voiceProvider: 'gemini' };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: 'data' })
        });

        await audioSystem.generateAudio(message, speaker, { options: {} }, 123, 'production');

        // Extract the body from the fetch call to verify input length
        const fetchCall = mockFetch.mock.calls[0];
        const bodyParsed = JSON.parse(fetchCall[1].body);

        expect(bodyParsed.input.text.length).toBe(2000);
    });
});
