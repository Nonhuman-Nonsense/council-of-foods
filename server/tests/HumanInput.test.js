import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanInputHandler } from '@logic/HumanInputHandler.js';
import { TestFactory } from './commonSetup.js';
import { MockFactory } from './factories/MockFactory.ts';

describe('HumanInputHandler (Isolated)', () => {
    let handler;
    let mockContext;

    beforeEach(() => {
        const meeting = MockFactory.createStoredMeeting({
            _id: 42,
            characters: [
                { id: 'chair', name: 'Chair', voice: 'alloy' },
                { id: 'alice', name: 'Alice', type: 'panelist', voice: 'alloy' }
            ],
            state: { humanName: 'Frank' },
            conversation: []
        });

        mockContext = {
            meeting,
            environment: "test",
            serverOptions: MockFactory.createServerOptions(),
            socket: {
                emit: vi.fn()
            },
            broadcaster: {
                broadcastConversationUpdate: vi.fn(),
                broadcastMeetingStarted: vi.fn(),
                broadcastClientKey: vi.fn(),
                broadcastError: vi.fn(),
                broadcastConversationEnd: vi.fn()
            },
            audioSystem: {
                queueAudioGeneration: vi.fn()
            },
            services: {
                meetingsCollection: {
                    updateOne: vi.fn().mockResolvedValue({})
                }
            },
            startLoop: vi.fn(),
            handRaised: false,
            isPaused: false,
            dialogGenerator: {}
        };

        handler = new HumanInputHandler(mockContext);
    });

    describe('handleSubmitHumanMessage', () => {
        it('should process human message when awaiting question', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingQuestion('Frank')
            ];
            mockContext.isPaused = true;

            const humanMsg = { text: "What is the meaning of soup?", speaker: "Frank" };
            await handler.handleSubmitHumanMessage(humanMsg);

            expect(mockContext.meeting.conversation).toHaveLength(2);
            const addedMsg = mockContext.meeting.conversation[1];
            expect(addedMsg.text).toContain("What is the meaning of soup?");
            expect(addedMsg.type).toBe('human');
            expect(addedMsg.speaker).toBe('Frank');

            expect(mockContext.audioSystem.queueAudioGeneration).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'human' }),
                expect.objectContaining({ id: 'chair' }),
                mockContext.meeting,
                "test",
                mockContext.serverOptions
            );

            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.meeting.conversation);
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('should ignore if not awaiting question (validation logic)', async () => {
            mockContext.meeting.conversation = TestFactory.createConversation(2);

            await handler.handleSubmitHumanMessage({ text: "Hello" });

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.startLoop).not.toHaveBeenCalled();
        });
    });

    describe('handleSubmitHumanPanelist', () => {
        it('should process panelist answer when awaiting panelist', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingPanelist('alice')
            ];

            const answer = { text: "I think soup is great.", speaker: "alice" };
            await handler.handleSubmitHumanPanelist(answer);

            expect(mockContext.meeting.conversation).toHaveLength(2);
            const addedMsg = mockContext.meeting.conversation[1];
            expect(addedMsg.text).toContain("I think soup is great.");
            expect(addedMsg.type).toBe('panelist');
            expect(addedMsg.speaker).toBe('alice');

            expect(mockContext.audioSystem.queueAudioGeneration).toHaveBeenCalled();
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.meeting.conversation);
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });
});
