import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';
import { Logger } from '@root/src/utils/Logger.js';
import { MockFactory } from './factories/MockFactory.ts';

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

describe('AudioSystem', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;
    let mockOpenAI;

    const meeting = () => MockFactory.createStoredMeeting({ _id: 123 });
    const serverOptions = (overrides = {}) => MockFactory.createServerOptions(overrides);

    beforeEach(() => {
        vi.clearAllMocks();

        mockBroadcaster = {
            broadcastAudioUpdate: vi.fn(),
            broadcastError: vi.fn()
        };

        mockOpenAI = {
            audio: {
                speech: {
                    create: vi.fn().mockResolvedValue({
                        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
                    })
                },
                transcriptions: {
                    create: vi.fn().mockResolvedValue({
                        words: []
                    })
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

    it('should generate audio and broadcast update', async () => {
        const message = { id: 'msg1', text: 'Hello', sentences: ['Hello'] };
        const speaker = { id: 'char1', voice: 'alloy' };
        const environment = 'production';

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ voiceModel: 'tts-1', defaultAudioSpeed: 1 }),
            meeting(),
            environment
        );

        expect(mockOpenAI.audio.speech.create).toHaveBeenCalled();
        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'msg1',
            sentences: [
                expect.objectContaining({
                    text: 'Hello',
                    start: 0,
                    end: 1
                })
            ]
        }));
    });

    it('should skip audio generation if configured', async () => {
        const message = { id: 'msg1', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'alloy' };

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ skipAudio: true }),
            meeting(),
            'production'
        );

        expect(mockOpenAI.audio.speech.create).not.toHaveBeenCalled();
        expect(mockBroadcaster.broadcastAudioUpdate).not.toHaveBeenCalled();
    });

    it('should broadcast skipped type if message is skipped', async () => {
        const message = { id: 'msg1', type: 'skipped', text: '' };

        await audioSystem.generateAudio(message, {}, 'en', serverOptions(), meeting(), 'production');

        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith({
            id: 'msg1',
            type: 'skipped'
        });
    });

    it('should pass voiceInstruction to OpenAI API if provided', async () => {
        const message = { id: 'msg1', text: 'Hello', sentences: ['Hello'] };
        const speaker = { id: 'char1', voice: 'alloy', voiceInstruction: 'Speak like a pirate' };

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ voiceModel: 'tts-1', defaultAudioSpeed: 1 }),
            meeting(),
            'production'
        );

        expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith(expect.objectContaining({
            instructions: 'Speak like a pirate'
        }));
    });

    it('should retry on specific network errors (terminated)', async () => {
        const message = { id: 'msgRetry', text: 'Retry me', sentences: ['Retry me'] };
        const speaker = { id: 'char1', voice: 'alloy' };

        const createMock = mockOpenAI.audio.speech.create;
        createMock
            .mockRejectedValueOnce(new Error('terminated'))
            .mockResolvedValueOnce({
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            });

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ voiceModel: 'tts-1', defaultAudioSpeed: 1 }),
            meeting(),
            'production'
        );

        expect(createMock).toHaveBeenCalledTimes(2);
        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'msgRetry'
        }));
    });

    it('should suppress stale side effects after cancelPendingWork', async () => {
        const message = { id: 'msg-stale', text: 'Hello later', sentences: ['Hello later'] };
        const speaker = { id: 'char1', voice: 'alloy' };

        let resolveCreate;
        mockOpenAI.audio.speech.create.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveCreate = resolve;
                })
        );

        const generationPromise = audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({ voiceModel: 'tts-1', defaultAudioSpeed: 1 }),
            meeting(),
            'production'
        );

        await vi.waitFor(() => expect(mockOpenAI.audio.speech.create).toHaveBeenCalledTimes(1));
        audioSystem.cancelPendingWork();
        resolveCreate({
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });

        await generationPromise;

        expect(mockBroadcaster.broadcastAudioUpdate).not.toHaveBeenCalled();
        expect(mockServices.audioCollection.updateOne).not.toHaveBeenCalled();
        expect(mockServices.meetingsCollection.updateOne).not.toHaveBeenCalled();
    });

    it('should suppress skipped broadcasts for stale generations', async () => {
        audioSystem.cancelPendingWork();

        await audioSystem.generateAudio(
            { id: 'msg-skipped', type: 'skipped', text: '' },
            {},
            'en',
            serverOptions(),
            meeting(),
            'production',
            false,
            0
        );

        expect(mockBroadcaster.broadcastAudioUpdate).not.toHaveBeenCalled();
    });

    it('should not try Inworld subtitle timings for OpenAI voices', async () => {
        const message = { id: 'msg-openai-timings', text: 'Hello', sentences: ['Hello'] };
        const speaker = { id: 'char1', voice: 'shimmer', voiceProvider: 'openai' };

        await audioSystem.generateAudio(
            message,
            speaker,
            'en',
            serverOptions({
                subtitleTimingPriorities: ['inworld', 'estimated', 'whisper'],
                voiceModel: 'tts-1',
                defaultAudioSpeed: 1
            }),
            meeting(),
            'production'
        );

        expect(Logger.warn).not.toHaveBeenCalledWith(
            'AudioSystem',
            expect.stringContaining('Rejected inworld subtitle timings'),
        );
    });
});
