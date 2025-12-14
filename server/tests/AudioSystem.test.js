import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioSystem, AudioQueue } from '../src/logic/AudioSystem.js';

describe('AudioQueue', () => {
    it('should process tasks sequentially', async () => {
        const queue = new AudioQueue();
        const executionOrder = [];

        const createTask = (id, duration) => async () => {
            await new Promise(resolve => setTimeout(resolve, duration));
            executionOrder.push(id);
        };

        queue.add(createTask(1, 100));
        queue.add(createTask(2, 50));
        queue.add(createTask(3, 10));

        // Wait for all tasks
        // Since processNext is async but 'add' returns immediately, we need to wait enough time
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(executionOrder).toEqual([1, 2, 3]);
    });
});

describe('AudioSystem', () => {
    let mockSocket;
    let mockServices;
    let audioSystem;

    beforeEach(() => {
        mockSocket = { emit: vi.fn() };
        mockServices = {
            audioCollection: {
                findOne: vi.fn(),
                updateOne: vi.fn()
            },
            meetingsCollection: { updateOne: vi.fn() },
            getOpenAI: vi.fn().mockReturnValue({
                audio: {
                    speech: {
                        create: vi.fn().mockResolvedValue({
                            arrayBuffer: async () => new ArrayBuffer(8)
                        })
                    },
                    transcriptions: {
                        create: vi.fn().mockResolvedValue({
                            words: []
                        })
                    }
                }
            })
        };
        audioSystem = new AudioSystem(mockSocket, mockServices);
        // Mock getSentenceTimings to avoid OpenAI call for timing
        vi.spyOn(audioSystem, 'getSentenceTimings').mockResolvedValue([]);
    });

    it('should queue audio generation', () => {
        vi.spyOn(audioSystem.queue, 'add');
        audioSystem.queueAudioGeneration({}, {}, {}, 'meeting_1', 'test');
        expect(audioSystem.queue.add).toHaveBeenCalled();
    });

    it('should generate audio and emit update', async () => {
        const message = { id: 'msg_1', text: 'Hello', type: 'message' };
        const speaker = { voice: 'alloy' };
        const options = { voiceModel: 'tts-1', audio_speed: 1.0 };

        await audioSystem.generateAudio(message, speaker, options, 'meeting_1', 'test');

        expect(mockServices.getOpenAI).toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('audio_update', expect.objectContaining({
            id: 'msg_1',
            audio: expect.any(Buffer)
        }));
    });

    it('should skip generation if skipAudio option is true', async () => {
        const options = { skipAudio: true };
        await audioSystem.generateAudio({}, {}, options, 'meeting_1', 'test');
        expect(mockServices.getOpenAI).not.toHaveBeenCalled();
    });
});
