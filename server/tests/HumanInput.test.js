import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumanInputHandler } from '@logic/HumanInputHandler.js';
import { TestFactory } from './commonSetup.js';

describe('HumanInputHandler (Isolated)', () => {
    let handler;
    let mockContext;

    beforeEach(() => {
        // Create a lightweight mock context based on IHumanInputContext
        mockContext = {
            meetingId: "test_meeting",
            environment: "test",
            conversation: [],
            conversationOptions: {
                characters: [{ id: 'chair', name: 'Chair' }, { id: 'alice', name: 'Alice', type: 'panelist' }],
                options: {},
                state: { humanName: 'Frank' }
            },
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

            // IConversationState properties
            handRaised: false,
            isPaused: false,

            // IMeetingLogicSubsystems (we already mocked audioSystem)
            dialogGenerator: {} // Not used in this handler usually, or mocked if needed
        };

        handler = new HumanInputHandler(mockContext);
    });

    describe('handleSubmitHumanMessage', () => {
        it('should process human message when awaiting question', async () => {
            // Setup: Awaiting Human Question
            mockContext.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingQuestion('Frank')
            ];
            mockContext.isPaused = true;

            const humanMsg = { text: "What is the meaning of soup?", speaker: "Frank" };
            await handler.handleSubmitHumanMessage(humanMsg);

            // 1. Verify Message Added
            expect(mockContext.conversation).toHaveLength(2); // prev + human (awaiting popped)
            const addedMsg = mockContext.conversation[1];
            expect(addedMsg.text).toContain("What is the meaning of soup?");
            expect(addedMsg.type).toBe('human');
            expect(addedMsg.speaker).toBe('Frank');

            // 2. Verify Audio Queued
            expect(mockContext.audioSystem.queueAudioGeneration).toHaveBeenCalledWith(
                addedMsg,
                expect.objectContaining({ id: 'chair' }), // Chair is char 0
                { options: mockContext.conversationOptions.options },
                "test_meeting",
                "test"
            );

            // 3. Verify socket emit
            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.conversation);

            // 4. Verify DB Update
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();

            // 5. Verify Loop Resumed
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('should ignore if not awaiting question (validation logic)', async () => {
            // Setup: NOT awaiting question
            mockContext.conversation = TestFactory.createConversation(2);

            await handler.handleSubmitHumanMessage({ text: "Hello" });

            // Should NOT have added message
            expect(mockContext.conversation).toHaveLength(2);
            // Should NOT have resumed loop
            expect(mockContext.startLoop).not.toHaveBeenCalled();
        });
    });

    describe('handleSubmitHumanPanelist', () => {
        it('should process panelist answer when awaiting panelist', async () => {
            // Setup: Awaiting Panelist
            mockContext.conversation = [
                { type: 'message', text: 'prev', id: '1' },
                ...TestFactory.createAwaitingPanelist('alice')
            ];

            const answer = { text: "I think soup is great.", speaker: "alice" };
            await handler.handleSubmitHumanPanelist(answer);

            // 1. Verify Message Added
            expect(mockContext.conversation).toHaveLength(2);
            const addedMsg = mockContext.conversation[1];
            expect(addedMsg.text).toContain("I think soup is great.");
            expect(addedMsg.type).toBe('panelist');
            expect(addedMsg.speaker).toBe('alice');

            // 2. Verify Audio Queued
            expect(mockContext.audioSystem.queueAudioGeneration).toHaveBeenCalled();

            // 3. Verify DB & Socket
            expect(mockContext.services.meetingsCollection.updateOne).toHaveBeenCalled();
            expect(mockContext.broadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.conversation);

            // 4. Verify Loop Resumed
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });
});
