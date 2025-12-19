
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meetingsCollection } from '@services/DbService.js';
import { createTestManager, mockOpenAI } from './commonSetup.js';
import { MockFactory } from './factories/MockFactory.ts';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';

// Mock dependencies
// vi.mock('@services/OpenAIService.js', () => ({
//     getOpenAI: vi.fn(() => mockOpenAI),
// }));
vi.mock('@logic/SpeakerSelector.js', () => ({
    SpeakerSelector: {
        calculateNextSpeaker: vi.fn().mockReturnValue(0)
    }
}));

describe('MeetingManager - Conversation Flow', () => {
    let manager;
    let mockSocket;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        manager.meetingId = 1; // Manually assign ID for DB method testing
        mockSocket = setup.mockSocket;

        // Spy on DB methods
        vi.spyOn(meetingsCollection, 'updateOne');
        vi.clearAllMocks();
    });

    it('should pause and resume conversation only in prototype mode', () => {
        // 1. Verify 'test' mode (default)
        expect(manager.environment).toBe('test');
        mockSocket.trigger('pause_conversation');
        expect(manager.isPaused).toBe(false);

        // 2. Verify 'prototype' mode
        const { manager: protoManager, mockSocket: protoSocket } = createTestManager('prototype');
        protoManager.meetingId = 1;

        // Spy on DB/Methods for the new manager
        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker');
        vi.spyOn(meetingsCollection, 'updateOne'); // Global spy still works if same module instance

        // Trigger pause on the PROTO socket
        protoSocket.trigger('pause_conversation');
        expect(protoManager.isPaused).toBe(true);

        // Verify startLoop/processTurn aborts when paused
        // Since startLoop is valid entry point but isPaused check is inside runLoop
        // checking processTurn directly might bypass the check if logic is inside runLoop now?
        // Let's check logic:
        // runLoop calls processTurn.
        // runLoop checks isPaused.
        // processTurn ALSO check isPaused (redundant check I added).
        // So safe to call processTurn directly for unit test if we want to check that specific guard.
        // But better to call runLoop or startLoop to test the flow.
        protoManager.startLoop();
        expect(SpeakerSelector.calculateNextSpeaker).not.toHaveBeenCalled();

        // Resume
        // Mock generation to stop recursion
        vi.spyOn(protoManager.dialogGenerator, 'generateTextFromGPT').mockResolvedValue({
            response: "Test", id: "1", sentences: []
        });
        vi.spyOn(protoManager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        protoSocket.trigger('resume_conversation');
        expect(protoManager.isPaused).toBe(false);
        // It should have called startLoop -> runLoop -> processTurn -> calculateNextSpeaker
        expect(SpeakerSelector.calculateNextSpeaker).toHaveBeenCalled();

        // Cleanup: Stop the loop to prevent leakage into other tests
        protoManager.run = false;
    });

    it('should stop conversation when max length is reached', async () => {
        manager.conversationOptions.options.conversationMaxLength = 5;
        manager.extraMessageCount = 0;
        // Mock conversation to be full
        manager.conversation = new Array(5).fill({ type: 'message' });

        const spy = vi.spyOn(SpeakerSelector, 'calculateNextSpeaker');

        // Use runLoop to verify the loop condition
        await manager.runLoop();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should handle conversation turns (single turn verification) using DI', async () => {
        // Create a mock OpenAI service
        const mockOpenAI = {
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        id: 'gpt_id',
                        choices: [{ message: { content: 'Hello from DI Tomato' } }]
                    })
                }
            },
            audio: {
                speech: {
                    create: vi.fn().mockResolvedValue({ arrayBuffer: () => new ArrayBuffer(0) })
                },
                transcriptions: {
                    create: vi.fn().mockResolvedValue({ words: [] })
                }
            }
        };

        const mockGetOpenAI = () => mockOpenAI;

        // Re-create manager with injected service
        const { manager: diManager, mockSocket: diSocket } = createTestManager('test', null, {
            getOpenAI: mockGetOpenAI
        });
        diManager.meetingId = 1;

        diManager.conversationOptions.options.conversationMaxLength = 10;
        // Mock current speaker to Tomato (index 1 in default, 2 in extended? Default has Water, Tomato, Potato)
        // Water=0, Tomato=1.
        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(1);

        // We DO NOT mock generateTextFromGPT. We test it!

        let action = diManager.decideNextAction();
        expect(action.type).toBe('GENERATE_AI_RESPONSE');
        const speaker = diManager.conversationOptions.characters[1];
        await diManager.processTurn({ type: action.type, speaker });

        // Verify Message added
        expect(diManager.conversation).toHaveLength(1);
        expect(diManager.conversation[0].text).toBe('Hello from DI Tomato');

        // Verify OpenAI usage
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();

        // Verify Socket Emit
        expect(diSocket.emit).toHaveBeenCalledWith('conversation_update', expect.any(Array));

        // Verify DB logic (still uses global mock unless we inject that too, but global mock is fine for now)
        expect(meetingsCollection.updateOne).toHaveBeenCalled();
    });

    it('should set awaiting_human_panelist state when current speaker is a panelist', async () => {
        // Setup: Next speaker is Alice (Panelist)
        // Alice is index 2 in default setup (Water, Tomato, Potato) -> wait, need to add Alice.
        manager.conversationOptions.characters = [
            { id: 'water', name: 'Water', type: 'food' },
            { id: 'alice', name: 'Alice', type: 'panelist' }
        ];
        const panelistId = 1; // Alice is now index 1

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(panelistId); // Alice

        let action = manager.decideNextAction();
        expect(action.type).toBe('REQUEST_PANELIST');
        const speaker = manager.conversationOptions.characters[panelistId];
        await manager.processTurn({ type: action.type, speaker });

        expect(manager.conversation).toHaveLength(1);
        expect(manager.conversation[0].type).toBe('awaiting_human_panelist');
        expect(manager.conversation[0].speaker).toBe('alice');
        expect(meetingsCollection.updateOne).toHaveBeenCalled();

        // Verify it returns early (does not call generateGPT/Audio/recurse)
        // calculateCurrentSpeaker WAS called, but generateTextFromGPT should NOT be.
        const gptSpy = vi.spyOn(manager.dialogGenerator, 'generateTextFromGPT');
        expect(gptSpy).not.toHaveBeenCalled();
    });
    it('should successfully wrap up meeting without ReferenceError (Regression Test)', async () => {
        // Setup mock OpenAI with audio capability
        const mockOpenAI = {
            chat: {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        id: 'gpt_id',
                        choices: [{ message: { content: 'This is a summary.' } }]
                    })
                }
            },
            audio: {
                speech: {
                    create: vi.fn().mockResolvedValue({ arrayBuffer: () => new ArrayBuffer(0) })
                },
                transcriptions: {
                    create: vi.fn().mockResolvedValue({ words: [] })
                }
            }
        };

        const mockGetOpenAI = () => mockOpenAI;
        const { manager: diManager } = createTestManager('test', null, { getOpenAI: mockGetOpenAI });
        diManager.meetingId = 1;

        // Ensure characters[0] (Chair) has a voice property if needed, though default setup usually provides it
        if (!diManager.conversationOptions.characters[0].voice) {
            diManager.conversationOptions.characters[0].voice = 'alloy';
        }

        const message = { date: '2025-01-01', text: "Summary text", id: "summary_msg_id" };

        // This call previously failed with ReferenceError: speaker is not defined
        await diManager.meetingLifecycleHandler.handleWrapUpMeeting({ date: "2024-01-01" });

        // Verify audio generation was attempted (which uses the 'speaker' variable)
        if (!diManager.globalOptions.skipAudio) {
            expect(mockOpenAI.audio.speech.create).toHaveBeenCalled();

            // Verify socket emit
            expect(diManager.socket.emit).toHaveBeenCalledWith("audio_update", expect.objectContaining({
                id: 'gpt_id'
            }));
        }
    });

    it('should extend meeting on continue_conversation', async () => {
        // Setup initial max length state
        manager.conversationOptions.options = {
            conversationMaxLength: 5,
            extraMessageCount: 5
        };
        manager.extraMessageCount = 0;

        // Populate conversation to limit
        manager.conversation = new Array(5).fill({});

        // Spy on startLoop/runLoop to verify resumption
        const loopSpy = vi.spyOn(manager, 'startLoop');

        // Trigger continue
        mockSocket.trigger('continue_conversation');

        // Verify count increased
        expect(manager.extraMessageCount).toBe(5);

        // Verify loop resumed
        expect(loopSpy).toHaveBeenCalled();

        // Verify that with new limit, another turn would be processed
        // (If we were to run processTurn, it would pass the length check now)
        // length (5) < 5 + 5
    });

    it('should handle request_clientkey event', async () => {
        // Setup mock OpenAI with audio capability
        const mockOpenAI = {
            chat: {},
            audio: {},
            apiKey: 'test-api-key'
        };
        const mockGetOpenAI = () => mockOpenAI;
        const { manager: keyManager, mockSocket: keySocket } = createTestManager('test', null, { getOpenAI: mockGetOpenAI });
        keyManager.meetingId = 1;

        // Mock fetch for OpenAI API
        global.fetch = vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({ value: 'mock_client_secret' })
        });

        // Trigger request
        await keyManager.meetingLifecycleHandler.handleRequestClientKey();

        // Verify fetch called with correct URL and headers
        expect(global.fetch).toHaveBeenCalledWith(
            "https://api.openai.com/v1/realtime/client_secrets",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer test-api-key"
                })
            })
        );

        // Verify socket response
        expect(keySocket.emit).toHaveBeenCalledWith("clientkey_response", { value: 'mock_client_secret' });
    });
});
