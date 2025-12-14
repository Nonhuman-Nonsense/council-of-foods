import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestManager } from './commonSetup.js';

// No mocks needed for DB or OpenAI!

describe('MeetingManager - Decision Logic', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        // The default common setup has 3 chars: Water(0), Tomato(1), Potato(2).
        // Let's add Alice(3) for the panelist test.
        manager.conversationOptions.characters.push({ id: 'alice', name: 'Alice', type: 'panelist' });
        // Now indices: Water(0), Tomato(1), Potato(2), Alice(3)
    });

    it('should return END_CONVERSATION when max length is reached', () => {
        manager.conversationOptions.options.conversationMaxLength = 5;
        manager.extraMessageCount = 0;
        // Mock a full conversation
        manager.conversation = new Array(5).fill({ type: 'message' });

        const decision = manager.decideNextAction();
        expect(decision).toEqual({ type: 'END_CONVERSATION' });
    });

    it('should return WAIT when awaiting human panelist', () => {
        manager.conversation = [{ type: 'awaiting_human_panelist' }];
        const decision = manager.decideNextAction();
        expect(decision).toEqual({ type: 'WAIT' });
    });

    it('should return WAIT when awaiting human question', () => {
        manager.conversation = [{ type: 'awaiting_human_question' }];
        const decision = manager.decideNextAction();
        expect(decision).toEqual({ type: 'WAIT' });
    });

    it('should return REQUEST_PANELIST when next speaker is a panelist', () => {
        // Force next speaker to be Alice (id: 'alice', index: 3)
        vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(3);

        const decision = manager.decideNextAction();
        expect(decision).toEqual({
            type: 'REQUEST_PANELIST',
            speaker: expect.objectContaining({ id: 'alice', type: 'panelist' })
        });
    });

    it('should return GENERATE_AI_RESPONSE when next speaker is AI character', () => {
        // Force next speaker to be Tomato (id: 'tomato', index: 1)
        vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(1);

        const decision = manager.decideNextAction();
        expect(decision).toEqual({
            type: 'GENERATE_AI_RESPONSE',
            speaker: expect.objectContaining({ id: 'tomato', type: 'food' })
        });
    });
});
