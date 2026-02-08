import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioSystem } from '@root/src/logic/AudioSystem.js';

vi.mock('music-metadata', () => ({
    parseBuffer: vi.fn().mockResolvedValue({
        format: { duration: 1 }
    })
}));

describe('AudioSystem', () => {
    let audioSystem;
    let mockBroadcaster;
    let mockServices;
    let mockOpenAI;

    beforeEach(() => {
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
        const options = { voiceModel: 'tts-1', audio_speed: 1 };
        const meetingId = 123;
        const environment = 'production';

        await audioSystem.generateAudio(message, speaker, { options }, meetingId, environment);

        expect(mockOpenAI.audio.speech.create).toHaveBeenCalled();
        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'msg1',
            sentences: [] // Empty because mock transcription returns empty words
        }));
    });

    it('should skip audio generation if configured', async () => {
        const message = { id: 'msg1', text: 'Hello' };
        const speaker = { id: 'char1', voice: 'alloy' };
        const options = { skipAudio: true };

        await audioSystem.generateAudio(message, speaker, { options }, 123, 'production');

        expect(mockOpenAI.audio.speech.create).not.toHaveBeenCalled();
        expect(mockBroadcaster.broadcastAudioUpdate).not.toHaveBeenCalled();
    });

    it('should broadcast skipped type if message is skipped', async () => {
        const message = { id: 'msg1', type: 'skipped', text: '' };
        const options = {};

        await audioSystem.generateAudio(message, {}, { options }, 123, 'production');

        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith({
            id: 'msg1',
            type: 'skipped'
        });
    });

    it('should pass voiceInstruction to OpenAI API if provided', async () => {
        const message = { id: 'msg1', text: 'Hello', sentences: ['Hello'] };
        const speaker = { id: 'char1', voice: 'alloy', voiceInstruction: 'Speak like a pirate' };
        const options = { voiceModel: 'tts-1', audio_speed: 1 };
        const meetingId = 123;
        const environment = 'production';

        await audioSystem.generateAudio(message, speaker, { options }, meetingId, environment);

        expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith(expect.objectContaining({
            instructions: 'Speak like a pirate'
        }));
    });

    it('should retry on specific network errors (terminated)', async () => {
        const message = { id: 'msgRetry', text: 'Retry me', sentences: ['Retry me'] };
        const speaker = { id: 'char1', voice: 'alloy' };
        const options = { voiceModel: 'tts-1', audio_speed: 1 };
        const meetingId = 123;
        const environment = 'production';

        // Mock OpenAI to fail once then succeed
        // vi.mocked usage varies, assuming simple mock here for brevity as per existing test
        const createMock = mockOpenAI.audio.speech.create;
        createMock
            .mockRejectedValueOnce(new Error('terminated')) // First fail
            .mockResolvedValueOnce({                        // Then succeed
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            });

        await audioSystem.generateAudio(message, speaker, { options }, meetingId, environment);

        expect(createMock).toHaveBeenCalledTimes(2); // Initial + 1 retry
        expect(mockBroadcaster.broadcastAudioUpdate).toHaveBeenCalledWith(expect.objectContaining({
            id: 'msgRetry'
        }));
    });
});
