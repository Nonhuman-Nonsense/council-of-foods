import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager, TestFactory } from './commonSetup.js';
import { meetingsCollection } from '@services/DbService.js';

describe('MeetingManager - Concurrency & Isolation', () => {
    let p1, p2;

    const characters = [
        { id: 'water', name: 'Water', type: 'food' },
        { id: 'tomato', name: 'Tomato', type: 'food' }
    ];

    beforeEach(() => {
        // Create two independent managers, simulating two socket connections
        p1 = createTestManager('test');
        p2 = createTestManager('test');

        // Spy on DB to ensure we can track calls per meeting ID
        vi.spyOn(meetingsCollection, 'updateOne');
        vi.spyOn(meetingsCollection, 'insertOne');

        // Prevent background loops from running automatically
        vi.spyOn(p1.manager, 'startLoop').mockImplementation(() => { });
        vi.spyOn(p2.manager, 'startLoop').mockImplementation(() => { });
    });

    it('should maintain separate state for multiple concurrent meetings', async () => {
        // 1. Start Meeting 1
        const setup1 = {
            topic: "Topic 1",
            characters: [...characters],
            options: { conversationMaxLength: 10 }
        };
        await p1.manager.meetingLifecycleHandler.handleStartConversation(setup1);
        const id1 = p1.manager.meetingId;

        // 2. Start Meeting 2
        const setup2 = {
            topic: "Topic 2",
            characters: [...characters],
            options: { conversationMaxLength: 10 }
        };
        await p2.manager.meetingLifecycleHandler.handleStartConversation(setup2);
        const id2 = p2.manager.meetingId;

        // Verify distinct IDs
        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);

        // Verify Distinct State (Topic is top-level property)
        expect(p1.manager.conversationOptions.topic).toBe("Topic 1");
        expect(p2.manager.conversationOptions.topic).toBe("Topic 2");

        // 3. Process Turn on Meeting 1
        // Mock next speaker for P1 to be 'tomato' (1)
        vi.spyOn(p1.manager.dialogGenerator, 'generateTextFromGPT').mockResolvedValue({
            response: "P1 Response", id: "msg_p1", sentences: []
        });

        // Ensure Audio queue doesn't actually try to generate
        vi.spyOn(p1.manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

        // Trigger P1 logic
        p1.manager.conversation = TestFactory.createConversation(1); // [msg_0]
        await p1.manager.processTurn();

        // 4. Verify P1 updated, P2 unchanged
        expect(p1.manager.conversation).toHaveLength(2);
        expect(p1.manager.conversation[1].text).toBe("P1 Response");

        expect(p2.manager.conversation).toHaveLength(0); // P2 still empty/init because setup initializes it to empty array

        // 5. Verify DB Isolation
        // ensure updateOne was called for id1 specifically
        expect(meetingsCollection.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: id1 }),
            expect.anything()
        );
    });

    it('should allow independent execution without blocking', async () => {
        // Simulate a "slow" operation on M1 via mock delay
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        const setup = {
            topic: "Async Test",
            characters: [...characters],
            options: { conversationMaxLength: 10 }
        };

        // Start both
        await p1.manager.meetingLifecycleHandler.handleStartConversation({ ...setup, topic: "Slow" });
        await p2.manager.meetingLifecycleHandler.handleStartConversation({ ...setup, topic: "Fast" });

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

        const p1Promise = p1.manager.handleAITurn({ speaker: { id: 'tomato' } });
        const p2Promise = p2.manager.handleAITurn({ speaker: { id: 'tomato' } });

        // Await P2 first. It should finish BEFORE P1 if non-blocking works.
        await p2Promise;
        expect(p2.manager.conversation).toHaveLength(1);
        expect(p2.manager.conversation[0].text).toBe("Fast Response");

        // P1 should still be running or just finishing
        // Verify P1 didn't bleed into P2
        expect(p2.manager.conversation).toHaveLength(1); // Still just the one message

        await p1Promise;
        expect(p1.manager.conversation).toHaveLength(1);
        expect(p1.manager.conversation[0].text).toBe("Slow Response");
    });
});
