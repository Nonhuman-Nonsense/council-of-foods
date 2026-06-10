import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestManager, TestFactory } from './commonSetup.js';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';
import { DEFAULT_TEST_CHARACTERS } from './factories/MockFactory.ts';

describe('MeetingManager - State Machine (decideNextAction)', () => {
    let manager;
    const [chairCharacter, firstSpeaker] = DEFAULT_TEST_CHARACTERS;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
        // Add a human panelist at index 3.
        manager.meeting.characters.push({ id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' });
    });

    const scenarios = [
        {
            name: 'should end conversation if max length reached',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 5;
                mgr.meeting.conversationExtraSlots = 0;
                mgr.meeting.conversation = TestFactory.createConversation(5);
            },
            nextSpeakerIndex: 0,
            expected: { type: 'END_CONVERSATION' }
        },
        {
            name: 'should wait if awaiting human panelist',
            setup: (mgr) => {
                mgr.meeting.conversation = TestFactory.createAwaitingPanelist('alice');
            },
            nextSpeakerIndex: 0,
            expected: { type: 'IDLE' }
        },
        {
            name: 'should wait if awaiting human question',
            setup: (mgr) => {
                mgr.meeting.conversation = TestFactory.createAwaitingQuestion();
            },
            nextSpeakerIndex: 0,
            expected: { type: 'IDLE' }
        },
        {
            name: 'should wait if conversation already ended with max_reached sentinel',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 5;
                mgr.meeting.conversationExtraSlots = 0;
                mgr.meeting.conversation = [...TestFactory.createConversation(5), { type: 'max_reached' }];
            },
            nextSpeakerIndex: 0,
            expected: { type: 'IDLE' }
        },
        {
            name: 'should wait if conversation has already been finalized with a summary',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 5;
                mgr.meeting.conversationExtraSlots = 0;
                mgr.meeting.conversation = [
                    ...TestFactory.createConversation(5),
                    { id: 'sum1', type: 'summary', speaker: chairCharacter.id, text: 'Summary' },
                ];
            },
            nextSpeakerIndex: 0,
            expected: { type: 'IDLE' }
        },
        {
            name: 'should request panelist if next speaker is panelist',
            setup: (mgr) => {
                mgr.meeting.conversation = [];
            },
            nextSpeakerIndex: 3, // Alice
            expected: {
                type: 'REQUEST_PANELIST',
                speaker: expect.objectContaining({ id: 'panelist0' })
            }
        },
        {
            name: 'should generate AI response if next speaker is AI',
            setup: (mgr) => {
                mgr.meeting.conversation = [];
            },
            nextSpeakerIndex: 1, // Tomato
            expected: {
                type: 'GENERATE_AI_RESPONSE',
                speaker: expect.objectContaining({ id: firstSpeaker.id })
            }
        },
        {
            name: 'should wait if conversation is more than 3 messages ahead of maximumPlayedIndex',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 10;
                mgr.meeting.maximumPlayedIndex = 0;
                mgr.meeting.conversation = [
                    { id: 'a', type: 'message', speaker: chairCharacter.id, text: '1' },
                    { id: 'b', type: 'message', speaker: chairCharacter.id, text: '2' },
                    { id: 'c', type: 'message', speaker: chairCharacter.id, text: '3' },
                    { id: 'd', type: 'message', speaker: chairCharacter.id, text: '4' }
                ];
            },
            nextSpeakerIndex: 1,
            expected: { type: 'IDLE' }
        },
        {
            name: 'should not apply playback buffer in prototype environment',
            env: 'prototype',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 10;
                mgr.meeting.maximumPlayedIndex = 0;
                mgr.meeting.conversation = [
                    { id: 'a', type: 'message', speaker: chairCharacter.id, text: '1' },
                    { id: 'b', type: 'message', speaker: chairCharacter.id, text: '2' },
                    { id: 'c', type: 'message', speaker: chairCharacter.id, text: '3' },
                    { id: 'd', type: 'message', speaker: chairCharacter.id, text: '4' }
                ];
            },
            nextSpeakerIndex: 1,
            expected: {
                type: 'GENERATE_AI_RESPONSE',
                speaker: expect.objectContaining({ id: firstSpeaker.id })
            }
        },
        {
            name: 'should not apply playback buffer when maximumPlayedIndex is unset',
            setup: (mgr) => {
                mgr.serverOptions.conversationMaxLength = 10;
                mgr.meeting.maximumPlayedIndex = undefined;
                mgr.meeting.conversation = [
                    { id: 'a', type: 'message', speaker: chairCharacter.id, text: '1' },
                    { id: 'b', type: 'message', speaker: chairCharacter.id, text: '2' },
                    { id: 'c', type: 'message', speaker: chairCharacter.id, text: '3' },
                    { id: 'd', type: 'message', speaker: chairCharacter.id, text: '4' }
                ];
            },
            nextSpeakerIndex: 1,
            expected: {
                type: 'GENERATE_AI_RESPONSE',
                speaker: expect.objectContaining({ id: firstSpeaker.id })
            }
        }
    ];

    scenarios.forEach(({ name, setup, nextSpeakerIndex, expected, env }) => {
        it(name, () => {
            const activeManager = env
                ? createTestManager(env).manager
                : manager;
            if (env) {
                activeManager.meeting.characters.push({ id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' });
            }
            setup(activeManager);
            vi.spyOn(SpeakerSelector, 'calculateNextSpeakerWithMethod').mockReturnValue({
                index: nextSpeakerIndex,
                method: 'round_robin',
            });

            const decision = activeManager.decideNextAction();
            expect(decision).toEqual(expected);
        });
    });
});
