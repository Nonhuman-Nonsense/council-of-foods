
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';
import { Logger } from '@root/src/utils/Logger.js';
import { MockFactory } from './factories/MockFactory.ts';

vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

vi.mock('@root/src/logic/GlobalOptions.js', async () => {
    const actual = await vi.importActual('@root/src/logic/GlobalOptions.js');
    return {
        ...actual,
        getGlobalOptions: vi.fn(() => ({
            inworldVoiceModel: 'inworld-tts-1',
            defaultAudioSpeed: 1.0,
            chairId: actual.CHAIR_ID
        }))
    };
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock PronunciationUtils
vi.mock('@root/src/utils/PronunciationUtils.js', () => ({
    PronunciationUtils: {
        processText: vi.fn((text, _language, options) => {
            if (options.includeIpa && text.includes('tomato')) {
                const map = new Map();
                map.set('/təˈmɑːtoʊ/', 'tomato');
                return {
                    processedText: text.replace('tomato', '/təˈmɑːtoʊ/'),
                    replacedWords: map
                };
            }
            return { processedText: text, replacedWords: new Map() };
        })
    }
}));

describe('AudioSystem Inworld Integration', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;

    const meeting = () => MockFactory.createStoredMeeting({ _id: 123 });
    const serverOptions = (overrides = {}) => MockFactory.createServerOptions(overrides);

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
        const environment = 'production';

        const mockAudioContent = Buffer.from('fake-inworld-audio').toString('base64');
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: mockAudioContent }),
            text: async () => ''
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.2, inworldVoiceModel: 'inworld-tts-1' }),
            meeting(),
            environment
        );

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

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: Buffer.from('audio').toString('base64') }),
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1' }),
            meeting(),
            'production'
        );

        const openai = mockServices.getOpenAI();
        expect(openai.audio.transcriptions.create).toHaveBeenCalled();
    });

    it('should use native timings if provided (Phase 2) and bypass Whisper', async () => {
        const message = { id: 'msg3', text: 'Native Test', sentences: ['Native Test'] };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                audioContent: Buffer.from('audio').toString('base64'),
                timestampInfo: {
                    wordAlignment: {
                        words: ['Native', 'Test'],
                        wordStartTimeSeconds: [0, 0.5],
                        wordEndTimeSeconds: [0.5, 1.0]
                    }
                }
            }),
            text: async () => ''
        });

        const openai = mockServices.getOpenAI();
        // Clear previous calls (if any from beforeEach/mocks setup, though fresh instance is created)
        vi.clearAllMocks();
        // We need to re-setup fetch mock after clearAllMocks
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                audioContent: Buffer.from('audio').toString('base64'),
                timestampInfo: {
                    wordAlignment: {
                        words: ['Native', 'Test'],
                        wordStartTimeSeconds: [0, 0.5],
                        wordEndTimeSeconds: [0.5, 1.0]
                    }
                }
            }),
            text: async () => ''
        });

        // Need to recreate audioSystem or just assume state is fresh. beforeEach creates new audioSystem.
        // But vi.clearAllMocks cleared the spy on openai.audio.transcriptions.create too?
        // mockServices.getOpenAI() returns the SAME mockOpenAI object defined in beforeEach.
        // vi.clearAllMocks() clears calls on all spies.

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1.5' }),
            meeting(),
            'production'
        );

        expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();
    });

    it('should ignore Inworld punctuation and space alignment tokens when mapping sentence timings', async () => {
        const firstWords = [
            'One', 'two', 'three', 'four', 'five',
            'six', 'seven', 'eight', 'nine', 'ten',
            'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
            'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'
        ];
        const secondWords = ['Final', 'word'];
        const firstSentence = `${firstWords.join(' ')}.`;
        const secondSentence = `${secondWords.join(' ')}.`;
        const spokenWords = [...firstWords, ...secondWords];
        const words = [];
        const starts = [];
        const ends = [];

        spokenWords.forEach((word, index) => {
            const start = index * 0.4;
            words.push(word, index === firstWords.length - 1 || index === spokenWords.length - 1 ? '. ' : ' ');
            starts.push(start, start + 0.35);
            ends.push(start + 0.35, start + 0.4);
        });

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                audioContent: Buffer.from('audio').toString('base64'),
                timestampInfo: {
                    wordAlignment: {
                        words,
                        wordStartTimeSeconds: starts,
                        wordEndTimeSeconds: ends
                    }
                }
            }),
            text: async () => ''
        });

        await audioSystem.generateAudio(
            { id: 'msg-punctuation', text: `${firstSentence} ${secondSentence}`, sentences: [firstSentence, secondSentence] },
            { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' },
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1.5' }),
            meeting(),
            'production'
        );

        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                sentences: [
                    expect.objectContaining({
                        text: firstSentence,
                        start: 0,
                        end: 7.95
                    }),
                    expect.objectContaining({
                        text: secondSentence,
                        start: 8,
                        end: 8.75
                    })
                ]
            })
        );
    });

    it('should report error on non-ok Inworld API response', async () => {
        const message = { id: 'msgErr', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };

        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error'
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1' }),
            meeting(),
            'production'
        );

        expect(Logger.reportAndCrashClient).toHaveBeenCalledWith(
            'AudioSystem',
            'Error generating audio',
            expect.objectContaining({
                error: expect.objectContaining({ message: expect.stringContaining('Inworld TTS API Error: 500 Internal Server Error') }),
                broadcaster: expect.anything(),
            }),
        );
    });

    it('should integrate PronunciationUtils to process IPA words', async () => {
        const message = { id: 'msgIPA', text: 'Say tomato please', sentences: ['Say tomato please'] };
        const speaker = { id: 'char1', voice: 'Dennis', voiceProvider: 'inworld' };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                audioContent: Buffer.from('audio').toString('base64'),
                timestampInfo: {
                    wordAlignment: {
                        words: ['Say', '/təˈmɑːtoʊ/', 'please'], // Start/End times omitted for brevity (TTSProviders handles it)
                        wordStartTimeSeconds: [0, 0.5, 1.0],
                        wordEndTimeSeconds: [0.5, 1.0, 1.5]
                    }
                }
            }),
            text: async () => ''
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1' }),
            meeting(),
            'production'
        );

        // Verify request payload contained processed text
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('/təˈmɑːtoʊ/')
            })
        );
        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.not.stringContaining('"tomato"') // "tomato" should be replaced
            })
        );

        // We can't easily inspect the returned words here because generateAudio is void.
        // But we can check if broadcastAudioUpdate was called with restored words!

        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                sentences: expect.arrayContaining([
                    expect.objectContaining({
                        text: 'Say tomato please'
                        // Logic for mapping sentences matches words, check if mapSentencesToWords worked?
                        // If words were RESTORED to 'tomato', then 'tomato' in sentence matches 'tomato' in words.
                        // If words remained '/təˈmɑːtoʊ/', mapSentencesToWords wouldn't match 'tomato' in sentence easily or logic handles it?
                        // Wait, mapSentencesToWords compares whisperTokens (lowercase).
                        // '/təˈmɑːtoʊ/' cleaned might not match 'tomato'.
                    })
                ])
            })
        );
    });

    it('should send language and TTS-2 model when voiceLocale is set', async () => {
        const message = { id: 'msg-sv', text: 'Hej', sentences: ['Hej'] };
        const speaker = {
            id: 'char1',
            voice: 'custom-sv-voice',
            voiceProvider: 'inworld',
            voiceLocale: 'sv-SE',
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: Buffer.from('audio').toString('base64') }),
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'sv',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1.5-max' }),
            meeting(),
            'production'
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model_id).toBe('inworld-tts-2');
        expect(body.language).toBe('sv-SE');
        expect(body.temperature).toBeUndefined();
    });

    it('should use TTS 1.5 without language when voiceLocale is unset', async () => {
        const message = { id: 'msg-en', text: 'Hello', sentences: ['Hello'] };
        const speaker = {
            id: 'char1',
            voice: 'Pippa',
            voiceProvider: 'inworld',
            voiceTemperature: 1.2,
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ audioContent: Buffer.from('audio').toString('base64') }),
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.0, inworldVoiceModel: 'inworld-tts-1.5-max' }),
            meeting(),
            'production'
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model_id).toBe('inworld-tts-1.5-max');
        expect(body.language).toBeUndefined();
        expect(body.temperature).toBe(1.2);
    });
});
