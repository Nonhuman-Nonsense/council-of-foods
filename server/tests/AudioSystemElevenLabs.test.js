
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';
import { Logger } from '@root/src/utils/Logger.js';
import { MockFactory } from './factories/MockFactory.ts';
import { ELEVENLABS_OPUS_OUTPUT_FORMAT } from '@root/src/logic/audio/TTSProviders.js';

vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockElevenLabsResponse(text) {
    const characters = [];
    const starts = [];
    const ends = [];
    let time = 0;

    for (const char of text) {
        characters.push(char);
        starts.push(time);
        time += 0.05;
        ends.push(time);
    }

    return {
        ok: true,
        json: async () => ({
            audio_base64: Buffer.from('fake-elevenlabs-audio').toString('base64'),
            normalized_alignment: {
                characters,
                character_start_times_seconds: starts,
                character_end_times_seconds: ends,
            },
        }),
        text: async () => ''
    };
}

describe('AudioSystem ElevenLabs Integration', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;

    const meeting = () => MockFactory.createStoredMeeting({ _id: 123 });
    const serverOptions = (overrides = {}) => MockFactory.createServerOptions(overrides);

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ELEVENLABS_API_KEY = "mock-elevenlabs-api-key";

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
        delete process.env.ELEVENLABS_API_KEY;
    });

    it('should call ElevenLabs with-timestamps API with voice settings', async () => {
        const message = { id: 'msg1', text: 'Hello ElevenLabs', sentences: ['Hello ElevenLabs'] };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
            voiceSpeed: 1.2,
            voiceStability: 0.7,
            voiceStyle: 0.3,
        };
        const environment = 'prototype';

        mockFetch.mockResolvedValue(mockElevenLabsResponse('Hello ElevenLabs'));

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ defaultAudioSpeed: 1.15, elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            environment
        );

        expect(mockFetch).toHaveBeenCalledWith(
            `https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/with-timestamps?output_format=${ELEVENLABS_OPUS_OUTPUT_FORMAT}`,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'xi-api-key': 'mock-elevenlabs-api-key',
                    'Content-Type': 'application/json'
                }),
            })
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model_id).toBe('eleven_flash_v2_5');
        expect(body.voice_settings).toEqual({
            speed: 1.2,
            stability: 0.7,
            style: 0.3,
        });
        expect(body.text).toBe('Hello ElevenLabs');
    });

    it('should pass ISO language code from voiceLocale', async () => {
        const message = { id: 'msg2', text: 'Hej', sentences: ['Hej'] };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
            voiceLocale: 'sv-SE'
        };

        mockFetch.mockResolvedValue(mockElevenLabsResponse('Hej'));

        await audioSystem.generateAudio(
            message,
            speaker,
            'sv',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype'
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.language_code).toBe('sv');
    });

    it('should apply alias spell-outs but not IPA for ElevenLabs', async () => {
        const message = { id: 'msgCO2', text: 'We emit CO₂ and tomato.', sentences: ['We emit CO₂ and tomato.'] };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
        };

        mockFetch.mockResolvedValue(mockElevenLabsResponse('We emit see oh two and tomato.'));

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype'
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.text).toBe('We emit see oh two and tomato.');
        expect(body.text).not.toContain('/təˈmɑːtoʊ/');
    });

    it('should apply Swedish alias spell-outs for ElevenLabs', async () => {
        const message = { id: 'msgCO2sv', text: 'Vi släpper ut CO₂.', sentences: ['Vi släpper ut CO₂.'] };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
            voiceLocale: 'sv-SE',
        };

        mockFetch.mockResolvedValue(mockElevenLabsResponse('Vi släpper ut cee oh två.'));

        await audioSystem.generateAudio(
            message,
            speaker,
            'sv',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype'
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.text).toBe('Vi släpper ut cee oh två.');
    });

    it('should spell out meeting numbers for English ElevenLabs', async () => {
        const message = {
            id: 'msgMeetingEn',
            text: 'This concludes Council of Foods meeting #1020.',
            sentences: ['This concludes Council of Foods meeting #1020.'],
        };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
        };

        mockFetch.mockResolvedValue(
            mockElevenLabsResponse('This concludes Council of Foods meeting number 1020.'),
        );

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype',
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.text).toBe('This concludes Council of Foods meeting number 1020.');
        expect(body.text).not.toContain('#1020');
    });

    it('should spell out meeting numbers for Swedish ElevenLabs', async () => {
        const message = {
            id: 'msgMeetingSv',
            text: 'Detta avslutar mötet #1020.',
            sentences: ['Detta avslutar mötet #1020.'],
        };
        const speaker = {
            id: 'char1',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            voiceProvider: 'elevenlabs',
            voiceLocale: 'sv-SE',
        };

        mockFetch.mockResolvedValue(
            mockElevenLabsResponse('Detta avslutar mötet nummer 1020.'),
        );

        await audioSystem.generateAudio(
            message,
            speaker,
            'sv',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype',
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.text).toBe('Detta avslutar mötet nummer 1020.');
        expect(body.text).not.toContain('#1020');
    });

    it('should use native ElevenLabs timings in production', async () => {
        const message = { id: 'msg4', text: 'Hello world', sentences: ['Hello world'] };
        const speaker = { id: 'char1', voice: 'voice-id', voiceProvider: 'elevenlabs' };

        mockFetch.mockResolvedValue(mockElevenLabsResponse('Hello world'));

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({
                elevenlabsVoiceModel: 'eleven_flash_v2_5',
                subtitleTimingPriorities: ['elevenlabs', 'estimated', 'whisper'],
            }),
            meeting(),
            'production'
        );

        const openai = mockServices.getOpenAI();
        expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();

        const broadcast = mockBroadcaster.broadcastAudioUpdate.mock.calls[0][0];
        expect(broadcast.sentences.length).toBe(1);
        expect(broadcast.sentences[0].text).toBe('Hello world');
        expect(broadcast.sentences[0].start).toBeGreaterThanOrEqual(0);
        expect(broadcast.sentences[0].end).toBeGreaterThan(broadcast.sentences[0].start);
    });

    it('should report API errors', async () => {
        const message = { id: 'msg3', text: 'Fail', sentences: ['Fail'] };
        const speaker = { id: 'char1', voice: 'bad-voice', voiceProvider: 'elevenlabs' };

        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized'
        });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ elevenlabsVoiceModel: 'eleven_flash_v2_5' }),
            meeting(),
            'prototype'
        );

        expect(Logger.reportAndCrashClient).toHaveBeenCalled();
    });
});
