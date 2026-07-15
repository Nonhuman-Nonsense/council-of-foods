
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { setupTestOptions } from './testUtils.js';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';
import { MockFactory } from './factories/MockFactory.ts';

// Mock dependencies
// vi.mock('@services/OpenAIService.js', () => ({
//     getOpenAI: vi.fn(() => mockOpenAI),
// }));
vi.mock('@logic/SpeakerSelector.js', () => ({
    SpeakerSelector: {
        calculateNextSpeaker: vi.fn().mockReturnValue(0),
    }
}));

describe('MeetingManager - Conversation Flow', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        manager.meeting._id = 1;

        // Spy on DB methods
        vi.spyOn(manager.services.meetingsCollection, 'updateOne');
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
        // While paused the loop runs a single IDLE iteration and exits, so the run loop
        // stops (loopRunning=false) while the session stays alive (isActive=true).
        await vi.waitFor(() => expect(protoManager.loopRunning).toBe(false));
        expect(SpeakerSelector.calculateNextSpeaker).not.toHaveBeenCalled();

        // Resume
        vi.spyOn(protoManager.dialogGenerator, 'generateResponseWithRetry').mockResolvedValue({
            response: "Test", id: "1", sentences: ["Test"]
        });
        vi.spyOn(protoManager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        await protoManager.handleEvent('resume_conversation', null);

        await vi.waitFor(() => {
            expect(protoManager.meeting.conversation.length).toBeGreaterThan(0);
        });

        expect(protoManager.isPaused).toBe(false);

        // Cleanup: Kill the session to stop the loop and prevent leakage into other tests
        protoManager.isActive = false;
    });

    it('should stop conversation when max length is reached', async () => {
        manager.serverOptions.conversationMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = new Array(5).fill({ type: 'message' });
        manager.isActive = true;

        const spy = vi.spyOn(SpeakerSelector, 'calculateNextSpeaker');

        // Use runLoop to verify the loop condition
        await manager.runLoop();

        expect(spy).not.toHaveBeenCalled();
        expect(manager.meeting.conversation.at(-1)?.type).toBe('query_extension');
        expect(manager.services.meetingsCollection.updateOne).toHaveBeenCalled();
    });

    it('concludes directly at hard cap without query_extension sentinel', async () => {
        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Closing line',
            id: 'close1',
        });
        vi.spyOn(manager.dialogGenerator, 'generateDocument').mockResolvedValue({
            response: 'Summary text',
            id: 'sum1',
        });
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);
        const endSpy = vi.spyOn(manager.broadcaster, 'broadcastConversationEnd');

        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = new Array(5).fill({ type: 'message' });
        manager.isActive = true;

        await manager.runLoop();

        expect(manager.meeting.conversation.at(-1)?.type).toBe('summary');
        expect(manager.meeting.conversation.at(-2)?.type).toBe('message');
        expect(manager.meeting.conversation.some((m) => m.type === 'query_extension')).toBe(false);
        expect(endSpy).not.toHaveBeenCalled();
        expect(manager.services.meetingsCollection.updateOne).toHaveBeenCalled();
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
        diManager.isActive = true;

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
        expect(diManager.services.meetingsCollection.updateOne).toHaveBeenCalled();
    });

    it('should set awaiting_human_panelist state when current speaker is a panelist', async () => {
        manager.meeting.characters = [
            MockFactory.createChair(),
            { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }
        ];
        const panelistId = 1;

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(panelistId);

        const action = manager.decideNextAction();
        expect(action.type).toBe('REQUEST_PANELIST');
        const speaker = manager.meeting.characters[panelistId];
        const chairInterjectionSpy = vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Please welcome Alice.',
            id: 'invite-1',
        });
        await manager.processTurn({ type: action.type, speaker });

        expect(chairInterjectionSpy).toHaveBeenCalled();
        expect(manager.meeting.conversation).toHaveLength(2);
        expect(manager.meeting.conversation[0].type).toBe('invitation');
        expect(manager.meeting.conversation[1].type).toBe('awaiting_human_panelist');
        expect(manager.meeting.conversation[1].speaker).toBe('panelist0');
        expect(manager.services.meetingsCollection.updateOne).toHaveBeenCalled();

        // Verify it returns early (does not call generateGPT/Audio/recurse)
        // calculateCurrentSpeaker WAS called, but generateTextFromGPT should NOT be.
        const gptSpy = vi.spyOn(manager.dialogGenerator, 'generateTextFromGPT');
        expect(gptSpy).not.toHaveBeenCalled();
    });

    it('should pass trimmed content through on panelist invitation', async () => {
        manager.meeting.characters = [
            MockFactory.createChair(),
            { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }
        ];
        const panelistId = 1;

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(panelistId);

        const action = manager.decideNextAction();
        expect(action.type).toBe('REQUEST_PANELIST');
        const speaker = manager.meeting.characters[panelistId];
        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Please welcome Alice.',
            trimmed: '\n\nShe will share her perspective.',
            id: 'invite-1',
        });
        await manager.processTurn({ type: action.type, speaker });

        expect(manager.meeting.conversation[0].trimmed).toBe('\n\nShe will share her perspective.');
    });

    it('should not replay panelist invitation after a skipped panelist turn', async () => {
        manager.meeting.characters = [
            MockFactory.createChair(),
            { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }
        ];
        manager.meeting.conversation = [
            { speaker: 'panelist0', type: 'skipped', text: '', id: 'skip-1' },
        ];
        const panelistIndex = 1;

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(panelistIndex);

        const action = manager.decideNextAction();
        expect(action.type).toBe('REQUEST_PANELIST');

        const chairInterjectionSpy = vi.spyOn(manager.dialogGenerator, 'chairInterjection');
        await manager.processTurn({ type: action.type, speaker: manager.meeting.characters[panelistIndex] });

        expect(chairInterjectionSpy).not.toHaveBeenCalled();
        expect(manager.meeting.conversation).toHaveLength(2);
        expect(manager.meeting.conversation[0].type).toBe('skipped');
        expect(manager.meeting.conversation[1].type).toBe('awaiting_human_panelist');
        expect(manager.meeting.conversation[1].speaker).toBe('panelist0');
    });

    it('should successfully conclude meeting without ReferenceError (Regression Test)', async () => {
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
        const generateAudioSpy = vi.spyOn(diManager.audioSystem, 'generateAudio').mockResolvedValue();

        if (!diManager.meeting.characters[0].voice) {
            diManager.meeting.characters[0].voice = 'alloy';
        }

        diManager.meeting.conversation = [
            { id: 'pre', type: 'message', text: 'before', speaker: diManager.meeting.characters[0].id },
            { type: 'query_extension' },
        ];

        await diManager.meetingLifecycleHandler.handleConcludeMeeting({ date: "2024-01-01" });

        // Verify audio generation was attempted regardless of the chair's current voice provider.
        if (!diManager.serverOptions.skipAudio) {
            expect(generateAudioSpy).toHaveBeenCalled();
            expect(generateAudioSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ id: 'gpt_id' }));
        }
    });

    it('should extend meeting on extend_meeting', async () => {
        const { manager } = createTestManager('test', { ...setupTestOptions(), extraMessageCount: 5 });
        manager.serverOptions.conversationMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = [...new Array(5).fill({ type: 'message' }), { type: 'query_extension' }];

        // Spy on startLoop/runLoop to verify resumption
        const loopSpy = vi.spyOn(manager, 'startLoop');

        // Trigger continue
        await manager.handleEvent('extend_meeting', null);

        expect(manager.meeting.conversationExtraSlots).toBe(5);
        expect(manager.meeting.conversation.map((m) => m.type)).toEqual([
            'message', 'message', 'message', 'message', 'message',
        ]);

        // Verify loop resumed
        expect(loopSpy).toHaveBeenCalled();
    });

});
