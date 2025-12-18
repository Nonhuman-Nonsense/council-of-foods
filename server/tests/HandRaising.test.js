import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandRaisingHandler } from '../src/logic/HandRaisingHandler.js';

describe('HandRaisingHandler', () => {
    let handler;
    let mockContext;
    let mockBroadcaster;
    let mockDialogGenerator;
    let mockAudioSystem;
    let mockMeetingsCollection;

    beforeEach(() => {
        mockBroadcaster = {
            broadcastConversationUpdate: vi.fn(),
            broadcastError: vi.fn()
        };

        mockDialogGenerator = {
            chairInterjection: vi.fn().mockResolvedValue({
                response: 'Speak now.',
                id: 'invitation_id'
            })
        };

        mockAudioSystem = {
            queueAudioGeneration: vi.fn()
        };

        mockMeetingsCollection = {
            updateOne: vi.fn()
        };

        mockContext = {
            manager: null, // Circular reference if needed, but handler stores 'manager' as this context usually
            // Wait, HandRaisingHandler constructor takes 'meetingManager'. 
            // The handler accesses 'this.manager'.
            meetingId: 123,
            conversation: [],
            conversationOptions: {
                state: {},
                options: {
                    raiseHandPrompt: { en: "Prompt [NAME]" },
                    raiseHandInvitationLength: 50
                },
                characters: [{ id: 'chair', name: 'Chair' }],
                language: 'en'
            },
            handRaised: false,
            broadcaster: mockBroadcaster,
            dialogGenerator: mockDialogGenerator,
            audioSystem: mockAudioSystem,
            services: {
                meetingsCollection: mockMeetingsCollection
            },
            environment: 'production'
        };

        // In the real class, constructor is: constructor(meetingManager) { this.manager = meetingManager; }
        // So we pass mockContext as meetingManager.
        handler = new HandRaisingHandler(mockContext);
    });

    it('should handle raise hand, truncate conversation, and generate invitation', async () => {
        // Setup initial conversation
        mockContext.conversation = [
            { id: 1, text: 'msg1' },
            { id: 2, text: 'msg2' },
            { id: 3, text: 'msg3' }
        ];

        await handler.handleRaiseHand({ index: 2, humanName: "Human" }); // Clip at index 2 (msg2 was the last heard?)
        // logic: manager.conversation = manager.conversation.slice(0, handRaisedOptions.index);
        // index 2 -> slice(0, 2) -> [msg1, msg2].

        expect(mockContext.handRaised).toBe(true);
        expect(mockContext.conversation.length).toBe(4); // [msg1, msg2] + Invitation + Awaiting

        const invitation = mockContext.conversation[2];
        expect(invitation.type).toBe('invitation');
        expect(invitation.text).toBe('Speak now.');

        const awaiting = mockContext.conversation[3];
        expect(awaiting.type).toBe('awaiting_human_question');

        expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.conversation);
        expect(mockMeetingsCollection.updateOne).toHaveBeenCalledWith(
            { _id: 123 },
            expect.objectContaining({ $set: expect.anything() })
        );
        expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalled();
    });

    it('should not regenerate invitation if already invited', async () => {
        mockContext.conversationOptions.state.alreadyInvited = true;
        mockContext.conversation = [{ text: 'msg1' }];

        await handler.handleRaiseHand({ index: 1, humanName: "Human" });

        expect(mockDialogGenerator.chairInterjection).not.toHaveBeenCalled();
        expect(mockContext.conversation).toHaveLength(2); // msg1 + awaiting
        expect(mockContext.conversation[1].type).toBe('awaiting_human_question');
    });
});
