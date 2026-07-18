import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanInputHandler } from '@logic/HumanInputHandler.js';
import { Logger } from '@utils/Logger.js';
import { TestFactory } from './commonSetup.js';
import { MockFactory } from './factories/MockFactory.ts';

vi.mock('@utils/Logger.js', () => ({
    Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), staleEvent: vi.fn(), reportAndCrashClient: vi.fn() },
}));

describe('HumanInputHandler (Isolated)', () => {
    let handler;
    let mockContext;
    const chair = MockFactory.createChair();

    beforeEach(() => {
        const meeting = MockFactory.createStoredMeeting({
            _id: 42,
            characters: [
                chair,
                { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }
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
            dialogGenerator: {},
            speakerTargetClassifier: {
                inferTarget: vi.fn().mockResolvedValue(undefined)
            }
        };

        handler = new HumanInputHandler(mockContext);
        Logger.staleEvent.mockClear();
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
                expect.objectContaining({ id: chair.id }),
                mockContext.meeting,
                "test",
                mockContext.serverOptions
            );

            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.meeting.conversation);
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('drops stale submit_human_message without crashing client and delegates to Logger.staleEvent', async () => {
            mockContext.meeting.conversation = TestFactory.createConversation(2);
            mockContext.lastReconnectionAt = 123456;

            await handler.handleSubmitHumanMessage({ text: "Hello" });

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.startLoop).not.toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastError).not.toHaveBeenCalled();
            expect(Logger.staleEvent).toHaveBeenCalledWith(
                expect.any(String),
                'submit_human_message',
                expect.stringContaining("expected awaiting_human_question"),
                expect.objectContaining({ lastReconnectionAt: 123456 }),
            );
        });

        it('should persist inferred target ids while rendering the character name', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingQuestion('Frank')
            ];
            mockContext.speakerTargetClassifier.inferTarget.mockResolvedValue("panelist0");

            await handler.handleSubmitHumanMessage({ text: "What do you think?" });

            const addedMsg = mockContext.meeting.conversation[1];
            expect(mockContext.speakerTargetClassifier.inferTarget).toHaveBeenCalledWith(mockContext.meeting, {
                mode: "humanQuestion",
                text: "What do you think?",
                speakerId: "Frank",
            });
            expect(addedMsg.askParticular).toBe('panelist0');
            expect(addedMsg.text).toContain('Frank said:');
            expect(addedMsg.text).not.toContain('asked Alice');
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

        it('drops stale submit_human_panelist without crashing client and delegates to Logger.staleEvent', async () => {
            mockContext.meeting.conversation = TestFactory.createConversation(2);

            await handler.handleSubmitHumanPanelist({ text: "Late answer.", speaker: "alice" });

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.startLoop).not.toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastError).not.toHaveBeenCalled();
            expect(Logger.staleEvent).toHaveBeenCalledWith(
                expect.any(String),
                'submit_human_panelist',
                expect.stringContaining("expected awaiting_human_panelist"),
                expect.objectContaining({ lastReconnectionAt: mockContext.lastReconnectionAt }),
            );
        });

        it('should strip panelist invitation when submitting panelist response', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                { type: 'invitation', text: 'Please welcome Alice.', id: 'invite-1', speaker: 'water' },
                ...TestFactory.createAwaitingPanelist('alice')
            ];

            await handler.handleSubmitHumanPanelist({ text: "Hello council.", speaker: "alice" });

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.meeting.conversation[0].type).toBe('message');
            expect(mockContext.meeting.conversation[1].type).toBe('panelist');
        });
    });

    describe('handleSkipHumanTurn', () => {
        it('should skip human question when awaiting question', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingQuestion('Frank')
            ];
            mockContext.handRaised = true;
            mockContext.isPaused = true;

            await handler.handleSkipHumanTurn();

            expect(mockContext.meeting.conversation).toHaveLength(2);
            const skipped = mockContext.meeting.conversation[1];
            expect(skipped.type).toBe('skipped');
            expect(skipped.speaker).toBe('Frank');
            expect(skipped.text).toBe('');

            expect(mockContext.audioSystem.queueAudioGeneration).not.toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.meeting.conversation);
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();
            expect(mockContext.handRaised).toBe(false);
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('should skip human panelist when awaiting panelist', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingPanelist('alice')
            ];

            await handler.handleSkipHumanTurn();

            expect(mockContext.meeting.conversation).toHaveLength(2);
            const skipped = mockContext.meeting.conversation[1];
            expect(skipped.type).toBe('skipped');
            expect(skipped.speaker).toBe('alice');
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('should strip invitation when skipping panelist turn', async () => {
            mockContext.meeting.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                { type: 'invitation', text: 'Please welcome Alice.', id: 'invite-1', speaker: 'water' },
                ...TestFactory.createAwaitingPanelist('alice')
            ];

            await handler.handleSkipHumanTurn();

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.meeting.conversation[0].type).toBe('message');
            expect(mockContext.meeting.conversation[1].type).toBe('skipped');
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalledWith(
                { _id: 42 },
                expect.objectContaining({
                    $pull: { audio: 'invite-1' },
                })
            );
        });

        it('drops stale skip_human_turn without crashing client and delegates to Logger.staleEvent', async () => {
            mockContext.meeting.conversation = TestFactory.createConversation(2);

            await handler.handleSkipHumanTurn();

            expect(mockContext.meeting.conversation).toHaveLength(2);
            expect(mockContext.startLoop).not.toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastError).not.toHaveBeenCalled();
            expect(Logger.staleEvent).toHaveBeenCalledWith(
                expect.any(String),
                'skip_human_turn',
                expect.stringContaining("expected awaiting human input"),
                expect.objectContaining({ lastReconnectionAt: mockContext.lastReconnectionAt }),
            );
        });
    });
});
