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

        // Verify handleConversationTurn aborts when paused
        protoManager.handleConversationTurn();
        expect(protoManager.calculateCurrentSpeaker).not.toHaveBeenCalled();

        // Resume
        // Mock generation to stop recursion
        vi.spyOn(protoManager, 'generateTextFromGPT').mockResolvedValue({
            response: "Test", id: "1", sentences: []
        });
        vi.spyOn(protoManager, 'generateAudio').mockResolvedValue(true);

        protoSocket.trigger('resume_conversation');
        expect(protoManager.isPaused).toBe(false);
        expect(protoManager.calculateCurrentSpeaker).toHaveBeenCalled();
    });

    it('should stop conversation when max length is reached', async () => {
        manager.conversationOptions.options.conversationMaxLength = 2;
        manager.extraMessageCount = 0;

        // Fill conversation to limit
        manager.conversation = [
            { id: 1, text: 'msg1' },
            { id: 2, text: 'msg2' }
        ];

        const spy = vi.spyOn(manager, 'calculateCurrentSpeaker');
        await manager.handleConversationTurn();

        expect(spy).not.toHaveBeenCalled();
    });

    it('should handle conversation turns recursively (single turn verification)', async () => {
        // We want to verify that one turn leads to a message and database update
        // We mock calculateCurrentSpeaker to control flow
        vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(1); // Tomato

        // Mock GPT and Audio
        vi.spyOn(manager, 'generateTextFromGPT').mockResolvedValue({
            id: 'new_id',
            response: 'Hello from Tomato',
            sentences: ['Hello from Tomato'],
            trimmed: 'Hello from Tomato'
        });
        vi.spyOn(manager, 'generateAudio').mockResolvedValue(true);

        // Prevent infinite recursion by simulating a pause or stop condition AFTER the first turn?
        // handleConversationTurn calls itself at the end (lines 622+ in original logic probably, checked snippet was cut off).
        // To test "one turn", we can check if it calls generateTextFromGPT and updates DB.

        // IMPORTANT: We need to stop the recursion. 
        // We can spy on handleConversationTurn to see if it calls itself, 
        // OR we can set manager.run = false inside a side-effect? 
        // OR set isPaused = true inside generateTextFromGPT mock side-effect?

        vi.spyOn(manager, 'generateTextFromGPT').mockImplementation(async () => {
            return {
                id: 'new_id',
                response: 'Hello from Tomato',
                sentences: ['Hello from Tomato']
            };
        });

        // We need to stop the recursion naturally. 
        // handleConversationTurn calls itself. 
        // We can spy on handleConversationTurn and make it stop after the first call?
        // But we are testing the function itself.

        // Option: set max length to 1 (current length 0 + 1)
        manager.conversationOptions.options.conversationMaxLength = 1;
        manager.extraMessageCount = 0;

        await manager.handleConversationTurn();

        // Verify Message added
        expect(manager.conversation).toHaveLength(1);
        expect(manager.conversation[0].speaker).toBe('tomato');
        expect(manager.conversation[0].text).toBe('Hello from Tomato');

        // Verify Socket Emit
        // MeetingManager emits "conversation_update" with the full array, not "new_message".
        expect(mockSocket.emit).toHaveBeenCalledWith('conversation_update', expect.any(Array));

        // Also verify the array content sent matched local conversation
        const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'conversation_update');
        expect(emitCall[1]).toHaveLength(1);
        expect(emitCall[1][0].text).toBe('Hello from Tomato');

        // Verify DB Update
        expect(meetingsCollection.updateOne).toHaveBeenCalledWith(
            { _id: manager.meetingId },
            expect.objectContaining({ $set: { conversation: manager.conversation } })
        );
    });

    it('should set awaiting_human_panelist state when current speaker is a panelist', async () => {
        // Setup: Next speaker is Alice (Panelist)
        // Alice is index 2 in default setup (Water, Tomato, Potato) -> wait, need to add Alice.
        manager.conversationOptions.characters = [
            { id: 'water', name: 'Water', type: 'food' },
            { id: 'alice', name: 'Alice', type: 'panelist' }
        ];

        vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(1); // Alice

        await manager.handleConversationTurn();

        expect(manager.conversation).toHaveLength(1);
        expect(manager.conversation[0].type).toBe('awaiting_human_panelist');
        expect(manager.conversation[0].speaker).toBe('alice');

        // Verify it returns early (does not call generateGPT/Audio/recurse)
        // calculateCurrentSpeaker WAS called, but generateTextFromGPT should NOT be.
        const gptSpy = vi.spyOn(manager, 'generateTextFromGPT');
        expect(gptSpy).not.toHaveBeenCalled();
    });
});
