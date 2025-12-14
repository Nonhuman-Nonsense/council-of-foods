import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioSystem, AudioQueue } from '../src/logic/AudioSystem.js';
import { setupTestDependencies } from './commonSetup.js';
import { getTestMode, TEST_MODES } from './testUtils.js';

describe('AudioQueue', () => {
    it('should process tasks concurrently', async () => {
        const queue = new AudioQueue(3);
        const executionOrder = [];

        const createTask = (id, duration) => async () => {
            await new Promise(resolve => setTimeout(resolve, duration));
            executionOrder.push(id);
        };

        // Task 1: 100ms
        // Task 2: 50ms
        // Task 3: 10ms
        // If parallel, finish order should be 3, 2, 1
        queue.add(createTask(1, 100));
        queue.add(createTask(2, 50));
        queue.add(createTask(3, 10));

        // Wait significantly longer than the longest task to ensure all complete
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(executionOrder).toEqual([3, 2, 1]);
    });
});

import { setupTestDependencies } from './commonSetup.js';

describe('AudioSystem', () => {
    let mockSocket;
    let mockServices;
    let audioSystem;

    beforeEach(() => {
        const testDeps = setupTestDependencies();

        mockSocket = { emit: vi.fn() };
        mockServices = {
            audioCollection: {
                findOne: vi.fn(),
                updateOne: vi.fn()
            },
            meetingsCollection: { updateOne: vi.fn() },
            getOpenAI: testDeps.getOpenAI
        };
        // Verify mock return if in MOCK mode (manual check if needed, or trust setupTestDeps)
        if (typeof testDeps.getOpenAI().chat === 'undefined') {
            // In FAST mode, getOpenAI returns a function that returns the client.
            // In MOCK mode, it returns a function that returns the mock object.
            // Wait, commonSetup says: getOpenAI: () => mockOpenAI OR getOpenAI: getOpenAI (real)
            // Real getOpenAI returns the client instance.
            // Mock getOpenAI returns the mock object.
            // Tests below expect getOpenAI().audio... so it works.
        }

        // If we are in MOCK mode, we need to ensure the mock has the structure we expect for specific tests
        // The tests below perform manual configuration like:
        // const openai = mockServices.getOpenAI();
        // expect(openai.audio.speech.create).toHaveBeenCalled...

        // If we are in FAST mode, we can't spy on real OpenAI instance easily unless we spy on the method prototype or the instance returned.
        // But for "should generate audio and emit update" we expect "getOpenAI" to be called.
        // And "mockServices.getOpenAI" itself is the function.
        // So spy on mockServices?

        vi.spyOn(mockServices, 'getOpenAI');
        audioSystem = new AudioSystem(mockSocket, mockServices);
        // Mock getSentenceTimings to avoid OpenAI call for timing
        vi.spyOn(audioSystem, 'getSentenceTimings').mockResolvedValue([]);
    });

    it('should queue audio generation', () => {
        vi.spyOn(audioSystem.queue, 'add');
        audioSystem.queueAudioGeneration({ id: 'test', text: 'test' }, { voice: 'test' }, { skipAudio: true, voiceModel: 'tts-1' }, 'meeting_1', 'test');
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
    }, 20000); // Increased timeout for FAST mode API calls

    it('should skip generation if skipAudio option is true', async () => {
        const options = { skipAudio: true };
        await audioSystem.generateAudio({}, {}, options, 'meeting_1', 'test');
        expect(mockServices.getOpenAI).not.toHaveBeenCalled();
    });

    it('should correctly generate audio when valid options are provided', async () => {
        const message = { id: 'msg_valid', text: 'Valid Audio', type: 'message' };
        const speaker = { voice: 'alloy' };
        const options = { voiceModel: 'tts-1', audio_speed: 1.0 }; // Valid options provided

        await audioSystem.generateAudio(message, speaker, options, 'meeting_1', 'test');

        expect(mockSocket.emit).toHaveBeenCalledWith('audio_update', expect.objectContaining({
            id: 'msg_valid',
            audio: expect.any(Buffer)
        }));

        if (getTestMode() === TEST_MODES.MOCK) {
            const openai = mockServices.getOpenAI();
            expect(openai.audio.speech.create).toHaveBeenCalledWith(expect.objectContaining({
                model: 'tts-1',
                voice: 'alloy',
                input: 'Valid Audio'
            }));
        }
    }, 20000); // Increased timeout for FAST mode API calls

    it('should respect concurrency passed in constructor', () => {
        const customSystem = new AudioSystem(mockSocket, mockServices, 5);
        expect(customSystem.queue.concurrency).toBe(5);
    });
});
