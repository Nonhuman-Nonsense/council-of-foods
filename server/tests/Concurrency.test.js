import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager, TestFactory } from './commonSetup.js';
import { meetingsCollection } from '@services/DbService.js';
import { MockFactory } from './factories/MockFactory.ts';

describe('MeetingManager - Concurrency & Isolation', () => {
    let p1, p2;

    const characters = [
        MockFactory.createCharacter({ id: 'water', name: 'Water', type: 'food' }),
        MockFactory.createCharacter({ id: 'tomato', name: 'Tomato', type: 'food' }),
    ];

    beforeEach(() => {
        // Create two independent managers, simulating two socket connections
        p1 = createTestManager('test');
        p2 = createTestManager('test');

        const doc1 = MockFactory.createStoredMeeting({
            _id: 201,
            creatorKey: 'key-201',
            topic: MockFactory.createTopic({ id: 't1', title: 'Topic 1', description: 'd', prompt: 'p' }),
            characters,
            conversation: [],
        });
        const doc2 = MockFactory.createStoredMeeting({
            _id: 202,
            creatorKey: 'key-202',
            topic: MockFactory.createTopic({ id: 't2', title: 'Topic 2', description: 'd', prompt: 'p' }),
            characters,
            conversation: [],
        });

        vi.spyOn(meetingsCollection, 'findOne').mockImplementation(({ _id }) =>
            Promise.resolve(_id === 201 ? doc1 : _id === 202 ? doc2 : null)
        );

        // Spy on DB to ensure we can track calls per meeting ID
        vi.spyOn(meetingsCollection, 'updateOne');
        vi.spyOn(meetingsCollection, 'insertOne');

        // Prevent background loops from running automatically, but mark as active
        vi.spyOn(p1.manager, 'startLoop').mockImplementation(() => { p1.manager.isLoopActive = true; });
        vi.spyOn(p2.manager, 'startLoop').mockImplementation(() => { p2.manager.isLoopActive = true; });
    });

    it('should maintain separate state for multiple concurrent meetings', async () => {
        await p1.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: 201,
            creatorKey: 'key-201',
        });
        const id1 = p1.manager.meeting._id;

        await p2.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: 202,
            creatorKey: 'key-202',
        });
        const id2 = p2.manager.meeting._id;

        expect(id1).toBe(201);
        expect(id2).toBe(202);
        expect(id1).not.toBe(id2);

        expect(p1.manager.meeting.topic.title).toBe('Topic 1');
        expect(p2.manager.meeting.topic.title).toBe('Topic 2');

        vi.spyOn(p1.manager.dialogGenerator, 'generateTextFromGPT').mockResolvedValue({
            response: "P1 Response", id: "msg_p1", sentences: []
        });

        vi.spyOn(p1.manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        p1.manager.meeting.conversation = TestFactory.createConversation(1);
        const speaker = p1.manager.meeting.characters[1];
        await p1.manager.processTurn({ type: 'GENERATE_AI_RESPONSE', speaker });

        expect(p1.manager.meeting.conversation).toHaveLength(2);
        expect(p1.manager.meeting.conversation[1].text).toBe("P1 Response");

        expect(p2.manager.meeting.conversation).toHaveLength(0);

        expect(meetingsCollection.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: id1 }),
            expect.anything()
        );
    });

    it('should allow independent execution without blocking', async () => {
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        vi.spyOn(meetingsCollection, 'findOne').mockImplementation(({ _id }) =>
            Promise.resolve(
                MockFactory.createStoredMeeting({
                    _id,
                    creatorKey: _id === 203 ? 'key-slow' : 'key-fast',
                    topic: MockFactory.createTopic({
                        id: _id === 203 ? 'slow' : 'fast',
                        title: _id === 203 ? 'Slow' : 'Fast',
                        description: 'd',
                        prompt: 'p',
                    }),
                    characters,
                    conversation: [],
                })
            )
        );

        await p1.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: 203,
            creatorKey: 'key-slow',
        });
        await p2.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: 204,
            creatorKey: 'key-fast',
        });

        // Ensure Audio queue doesn't actually try to generate
        vi.spyOn(p1.manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });
        vi.spyOn(p2.manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        // M1 is going to take 100ms to generate
        vi.spyOn(p1.manager.dialogGenerator, 'generateTextFromGPT').mockImplementation(async () => {
            await delay(100);
            return { response: "Slow Response", id: "m1", sentences: [] };
        });

        // M2 is instant
        vi.spyOn(p2.manager.dialogGenerator, 'generateTextFromGPT').mockResolvedValue({
            response: "Fast Response", id: "m2", sentences: []
        });

        // Trigger both "simultaneously" (async)
        // Note: processTurn calls decideNextAction -> handleAITurn.
        // We can call handleAITurn directly to skip decision logic for this unit test if we want,
        // but calling processTurn is more integrative.
        // However, processTurn relies on SpeakerSelector.
        // Let's force handleAITurn to ensure we hit the generator.

        const tomato = characters[1];
        const p1Promise = p1.manager.handleAITurn({ speaker: tomato });
        const p2Promise = p2.manager.handleAITurn({ speaker: tomato });

        await p2Promise;
        expect(p2.manager.meeting.conversation).toHaveLength(1);
        expect(p2.manager.meeting.conversation[0].text).toBe("Fast Response");

        expect(p2.manager.meeting.conversation).toHaveLength(1);

        await p1Promise;
        expect(p1.manager.meeting.conversation).toHaveLength(1);
        expect(p1.manager.meeting.conversation[0].text).toBe("Slow Response");
    });
});
