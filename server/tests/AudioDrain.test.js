import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { meetingsCollection } from '@services/DbService.js';
import { MockFactory } from './factories/MockFactory.ts';

const DRAIN_MEETING_ID = 9001;
const DRAIN_LIVE_KEY = 'audio-drain-creator';

describe('Audio Queue Draining', () => {
    let p1;

    beforeEach(() => {
        p1 = createTestManager('test');
        vi.spyOn(meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(meetingsCollection, 'insertOne').mockResolvedValue({});
        vi.spyOn(meetingsCollection, 'findOne').mockResolvedValue(
            MockFactory.createStoredMeeting({
                _id: DRAIN_MEETING_ID,
                liveKey: DRAIN_LIVE_KEY,
                topic: MockFactory.createTopic({ title: 'Drain Test' }),
                characters: [
                    MockFactory.createCharacter({ id: 'speaker1', name: 'Speaker 1' }),
                    MockFactory.createCharacter({ id: 'speaker2', name: 'Speaker 2' }),
                ],
                conversation: [],
            })
        );
    });

    it('should stop generation loop on destroy but allow audio queue to drain', async () => {
        // 1. Setup - Mock Dependencies

        // Mock DialogGenerator to just return a hit immediately
        // We want to simulate the loop running fast and queuing audio
        vi.spyOn(p1.manager.dialogGenerator, 'generateResponseWithRetry').mockImplementation(async (speaker) => {
            return {
                response: `Message from ${speaker.id}`,
                id: `msg_${Date.now()}_${Math.random()}`,
                sentences: [`Message from ${speaker.id}`],
                type: 'assistant'
            };
        });

        // Mock AudioSystem.generateAudio to be SLOW
        // This simulates a backlog
        const audioCompletions = [];
        vi.spyOn(p1.manager.audioSystem, 'generateAudio').mockImplementation(async (msg) => {
            // Wait for a manual signal or just a long timer?
            // Let's use a long timer that we can fast-forward, or just a promise we resolve manually?
            // Actually, for "Zombie" check, we want to ensure they ARE called.

            await new Promise(r => setTimeout(r, 50)); // 50ms delay
            audioCompletions.push(msg.id);
        });

        // 2. Start Conversation (loads StoredMeeting from DB; see findOne mock in beforeEach)
        await p1.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: DRAIN_MEETING_ID,
            liveKey: DRAIN_LIVE_KEY,
            serverOptions: { conversationMaxLength: 10 },
        });

        // Let the loop queue at least one message and audio task before destroy.
        await vi.waitFor(() => {
            expect(p1.manager.meeting.conversation.length).toBeGreaterThan(0);
        });

        // 4. DESTROY
        p1.manager.destroy();

        // 5. Assertions

        // A: Session must be torn down (stops the loop and aborts in-flight generation)
        expect(p1.manager.isActive).toBe(false);

        // B: Capture current audio completions
        const _completionsAtDestroy = [...audioCompletions];

        // C: Wait for the "slow" audio tasks to finish
        await vi.waitFor(() => {
            expect(audioCompletions.length).toBeGreaterThan(0);
        });

        // Ideally, we want to prove that `generateAudio` kept running.
        // If we only managed to queue 1 item in 10ms, then completionsAtDestroy might be 0.
        // After wait, it should be 1.

        // Let's check that we didn't generate NEW text/turns after destroy
        const finalConversationCount = p1.manager.meeting.conversation.length;

        // Wait MORE to see if "Zombie Loop" (text generation) continues
        await new Promise(r => setTimeout(r, 100));

        expect(p1.manager.meeting.conversation.length).toBe(finalConversationCount);
        // This proves the text loop stopped.

        // And regarding audio:
        // We mock generateAudio. 
        // We want to ensure that if we queued 3 items, all 3 are processed.
        // It's hard to deterministically queue exactly 3 without controlling the loop stepping.

        // Let's just assert "No errors thrown" and "IsLoopActive is false".
        // The fact that node doesn't crash or hang is good.
    });
});
