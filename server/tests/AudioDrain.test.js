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
        // Text generation resolves immediately; audio generation is deliberately slow so a
        // task is still in flight (queued but unfinished) at the moment destroy() runs.
        vi.spyOn(p1.manager.dialogGenerator, 'generateResponseWithRetry').mockImplementation(async (speaker) => {
            return {
                response: `Message from ${speaker.id}`,
                id: `msg_${Date.now()}_${Math.random()}`,
                sentences: [`Message from ${speaker.id}`],
                type: 'assistant'
            };
        });

        const audioCompletions = [];
        vi.spyOn(p1.manager.audioSystem, 'generateAudio').mockImplementation(async (msg) => {
            await new Promise(r => setTimeout(r, 50));
            audioCompletions.push(msg.id);
        });

        await p1.manager.meetingLifecycleHandler.handleStartConversation({
            meetingId: DRAIN_MEETING_ID,
            liveKey: DRAIN_LIVE_KEY,
            serverOptions: { conversationMaxLength: 10 },
        });

        // Let the loop queue at least one message and audio task before destroy.
        await vi.waitFor(() => {
            expect(p1.manager.meeting.conversation.length).toBeGreaterThan(0);
        });

        p1.manager.destroy();

        // Session is torn down (stops the loop and aborts further text generation).
        expect(p1.manager.isActive).toBe(false);

        // The in-flight audio task (queued before destroy) still completes — the queue
        // drains rather than being killed with the session.
        await vi.waitFor(() => {
            expect(audioCompletions.length).toBeGreaterThan(0);
        });

        // No new turns are generated after destroy (the text loop actually stopped,
        // as opposed to merely being asked to and continuing anyway — a "zombie loop").
        const finalConversationCount = p1.manager.meeting.conversation.length;
        await new Promise(r => setTimeout(r, 100));
        expect(p1.manager.meeting.conversation.length).toBe(finalConversationCount);
    });
});
