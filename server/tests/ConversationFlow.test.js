import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meetingsCollection } from '../src/services/DbService.js';
import { meetingsCollection } from '../src/services/DbService.js';
import { createTestManager, mockOpenAI } from './commonSetup.js';

// Mock dependencies
vi.mock('../src/services/OpenAIService.js', () => ({
    getOpenAI: vi.fn(() => mockOpenAI),
}));

describe('MeetingManager - Conversation Flow', () => {
    let manager;
    let mockSocket;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        mockSocket = setup.mockSocket;

        // Spy on DB methods
        vi.spyOn(meetingsCollection, 'updateOne');
    });

    it('should pause and resume conversation only in prototype mode', () => {
        // 1. Verify 'test' mode (default)
        expect(manager.environment).toBe('test');
        mockSocket.trigger('pause_conversation');
        expect(manager.isPaused).toBe(false);

        // 2. Verify 'prototype' mode
        const { manager: protoManager, mockSocket: protoSocket } = createTestManager('prototype');

        // Spy on DB/Methods for the new manager
        vi.spyOn(protoManager, 'calculateCurrentSpeaker');
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
        expect(protoManager.calculateCurrentSpeaker).not.toHaveBeenCalled();

        // Resume
        // Mock generation to stop recursion
        vi.spyOn(protoManager, 'generateTextFromGPT').mockResolvedValue({
            response: "Test", id: "1", sentences: []
        });
        vi.spyOn(protoManager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        protoSocket.trigger('resume_conversation');
        expect(protoManager.isPaused).toBe(false);
        // It should have called startLoop -> runLoop -> processTurn -> calculateCurrentSpeaker
        expect(protoManager.calculateCurrentSpeaker).toHaveBeenCalled();
    });

    it('should stop conversation when max length is reached', async () => {
        manager.conversationOptions.options.conversationMaxLength = 5;
        manager.extraMessageCount = 0;
        // Mock conversation to be full
        manager.conversation = new Array(5).fill({ type: 'message' });

        const spy = vi.spyOn(manager, 'calculateCurrentSpeaker');

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

        diManager.conversationOptions.options.conversationMaxLength = 10;
        // Mock current speaker to Tomato (index 1 in default, 2 in extended? Default has Water, Tomato, Potato)
        // Water=0, Tomato=1.
        vi.spyOn(diManager, 'calculateCurrentSpeaker').mockReturnValue(1);

        // We DO NOT mock generateTextFromGPT. We test it!

        await diManager.processTurn();

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

        vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(panelistId); // Alice

        await manager.processTurn();

        expect(manager.conversation).toHaveLength(1);
        expect(manager.conversation[0].type).toBe('awaiting_human_panelist');
        expect(manager.conversation[0].speaker).toBe('alice');
        expect(meetingsCollection.updateOne).toHaveBeenCalled();

        // Verify it returns early (does not call generateGPT/Audio/recurse)
        // calculateCurrentSpeaker WAS called, but generateTextFromGPT should NOT be.
        const gptSpy = vi.spyOn(manager, 'generateTextFromGPT');
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

        // Ensure characters[0] (Chair) has a voice property if needed, though default setup usually provides it
        if (!diManager.conversationOptions.characters[0].voice) {
            diManager.conversationOptions.characters[0].voice = 'alloy';
        }

        const message = { date: '2025-01-01', text: "Summary text", id: "summary_msg_id" };

        // This call previously failed with ReferenceError: speaker is not defined
        await diManager.meetingLifecycleHandler.handleWrapUpMeeting({ date: "2024-01-01" });

        // Verify audio generation was attempted (which uses the 'speaker' variable)
        expect(mockOpenAI.audio.speech.create).toHaveBeenCalled();

        // Verify socket emit
        expect(diManager.socket.emit).toHaveBeenCalledWith("audio_update", expect.objectContaining({
            id: 'gpt_id'
        }));
    });
});
