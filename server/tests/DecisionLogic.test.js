import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestManager, TestFactory } from './commonSetup.js';

describe('MeetingManager - State Machine (decideNextAction)', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        // Add Alice (id: 'alice', type: 'panelist') to index 3
        manager.conversationOptions.characters.push({ id: 'alice', name: 'Alice', type: 'panelist' });
    });

    const scenarios = [
        {
            name: 'should end conversation if max length reached',
            setup: (mgr) => {
                mgr.conversationOptions.options.conversationMaxLength = 5;
                mgr.extraMessageCount = 0;
                mgr.conversation = TestFactory.createConversation(5);
            },
            nextSpeakerIndex: 0,
            expected: { type: 'END_CONVERSATION' }
        },
        {
            name: 'should wait if awaiting human panelist',
            setup: (mgr) => {
                mgr.conversation = TestFactory.createAwaitingPanelist('alice');
            },
            nextSpeakerIndex: 0,
            expected: { type: 'WAIT' }
        },
        {
            name: 'should wait if awaiting human question',
            setup: (mgr) => {
                mgr.conversation = TestFactory.createAwaitingQuestion();
            },
            nextSpeakerIndex: 0,
            expected: { type: 'WAIT' }
        },
        {
            name: 'should request panelist if next speaker is panelist',
            setup: (mgr) => {
                mgr.conversation = [];
            },
            nextSpeakerIndex: 3, // Alice
            expected: {
                type: 'REQUEST_PANELIST',
                speaker: expect.objectContaining({ id: 'alice', type: 'panelist' })
            }
        },
        {
            name: 'should generate AI response if next speaker is AI',
            setup: (mgr) => {
                mgr.conversation = [];
            },
            nextSpeakerIndex: 1, // Tomato
            expected: {
                type: 'GENERATE_AI_RESPONSE',
                speaker: expect.objectContaining({ id: 'tomato', type: 'food' })
            }
        }
    ];

    scenarios.forEach(({ name, setup, nextSpeakerIndex, expected }) => {
        it(name, () => {
            setup(manager);
            vi.spyOn(manager, 'calculateCurrentSpeaker').mockReturnValue(nextSpeakerIndex);

            const decision = manager.decideNextAction();
            expect(decision).toEqual(expected);
        });
    });
});
