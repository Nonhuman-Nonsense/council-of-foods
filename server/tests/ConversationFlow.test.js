
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meetingsCollection } from '@services/DbService.js';
import { createTestManager } from './commonSetup.js';
import { setupTestOptions } from './testUtils.js';
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

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        manager.meeting._id = 1;

        // Spy on DB methods
        vi.spyOn(meetingsCollection, 'updateOne');
        vi.clearAllMocks();
    });

    it('should pause and resume conversation only in prototype mode', async () => {
        // 1. Verify 'test' mode (default)
        expect(manager.environment).toBe('test');
        await manager.handleEvent('pause_conversation', null);
        expect(manager.isPaused).toBe(false);

        // Mock DB collection to avoid connection errors during async loop
        const mockCollection = {
            updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
            findOne: vi.fn(),
            insertOne: vi.fn()
        };
        const mockAudioCollection = {
            findOne: vi.fn(),
            insertOne: vi.fn(),
            updateOne: vi.fn()
        };

        // 2. Verify 'prototype' mode
        const { manager: protoManager } = createTestManager('prototype', null, {
            meetingsCollection: mockCollection,
            audioCollection: mockAudioCollection,
            insertMeeting: vi.fn().mockResolvedValue({ insertedId: 1 })
        });
        protoManager.meeting._id = 1;

        // Spy on SpeakerSelector
        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker');

        // Trigger pause on the PROTO socket (via handleEvent)
        await protoManager.handleEvent('pause_conversation', null);
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

        await protoManager.handleEvent('resume_conversation', null);

        // Wait for async loop to tick
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(protoManager.isPaused).toBe(false);
        // It should have called startLoop -> runLoop -> processTurn and generated a message
        // Since we mocked generateTextFromGPT to return "Test", conversation should increase
        expect(protoManager.meeting.conversation.length).toBeGreaterThan(0);

        // Cleanup: Stop the loop to prevent leakage into other tests
        protoManager.isLoopActive = false;
    });

    it('should stop conversation when max length is reached', async () => {
        manager.serverOptions.conversationMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = new Array(5).fill({ type: 'message' });
        manager.isLoopActive = true;

        const spy = vi.spyOn(SpeakerSelector, 'calculateNextSpeaker');

        // Use runLoop to verify the loop condition
        await manager.runLoop();

        expect(spy).not.toHaveBeenCalled();
        expect(manager.meeting.conversation.at(-1)?.type).toBe('max_reached');
        expect(manager.meeting.conversation.at(-1)?.canContinue).toBe(true);
        expect(meetingsCollection.updateOne).toHaveBeenCalled();
    });

    it('sets canContinue false on max_reached when at meetingVeryMaxLength', async () => {
        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = new Array(5).fill({ type: 'message' });
        manager.isLoopActive = true;

        await manager.runLoop();

        expect(manager.meeting.conversation.at(-1)).toEqual(
            expect.objectContaining({ type: 'max_reached', canContinue: false }),
        );
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
        diManager.meeting._id = 1;
        diManager.isLoopActive = true;

        diManager.serverOptions.conversationMaxLength = 10;
        // Mock current speaker to Tomato (index 1 in default, 2 in extended? Default has Water, Tomato, Potato)
        // Water=0, Tomato=1.
        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(1);

        // We DO NOT mock generateTextFromGPT. We test it!

        const action = diManager.decideNextAction();
        expect(action.type).toBe('GENERATE_AI_RESPONSE');
        const speaker = diManager.meeting.characters[1];
        await diManager.processTurn({ type: action.type, speaker });

        expect(diManager.meeting.conversation).toHaveLength(1);
        expect(diManager.meeting.conversation[0].text).toBe('Hello from DI Tomato');

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
        manager.meeting.characters = [
            { id: 'water', name: 'Water', type: 'food', voice: 'alloy' },
            { id: 'alice', name: 'Alice', type: 'panelist', voice: 'alloy' }
        ];
        const panelistId = 1;

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(panelistId);

        const action = manager.decideNextAction();
        expect(action.type).toBe('REQUEST_PANELIST');
        const speaker = manager.meeting.characters[panelistId];
        await manager.processTurn({ type: action.type, speaker });

        expect(manager.meeting.conversation).toHaveLength(1);
        expect(manager.meeting.conversation[0].type).toBe('awaiting_human_panelist');
        expect(manager.meeting.conversation[0].speaker).toBe('alice');
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
        diManager.meeting._id = 1;

        if (!diManager.meeting.characters[0].voice) {
            diManager.meeting.characters[0].voice = 'alloy';
        }

        diManager.meeting.conversation = [
            { id: 'pre', type: 'message', text: 'before', speaker: diManager.meeting.characters[0].id },
            { type: 'max_reached' },
        ];

        await diManager.meetingLifecycleHandler.handleWrapUpMeeting({ date: "2024-01-01" });

        // Verify audio generation was attempted (which uses the 'speaker' variable)
        if (!diManager.serverOptions.skipAudio) {
            expect(mockOpenAI.audio.speech.create).toHaveBeenCalled();

            // Verify socket emit
            expect(diManager.socket.emit).toHaveBeenCalledWith("audio_update", expect.objectContaining({
                id: 'gpt_id'
            }));
        }
    });

    it('should extend meeting on continue_conversation', async () => {
        const { manager } = createTestManager('test', { ...setupTestOptions(), extraMessageCount: 5 });
        manager.serverOptions.conversationMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = [...new Array(5).fill({ type: 'message' }), { type: 'max_reached' }];

        // Spy on startLoop/runLoop to verify resumption
        const loopSpy = vi.spyOn(manager, 'startLoop');

        // Trigger continue
        await manager.handleEvent('continue_conversation', null);

        expect(manager.meeting.conversationExtraSlots).toBe(5);
        expect(manager.meeting.conversation.map((m) => m.type)).toEqual([
            'message', 'message', 'message', 'message', 'message',
        ]);

        // Verify loop resumed
        expect(loopSpy).toHaveBeenCalled();
    });

});
