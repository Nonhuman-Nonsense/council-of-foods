import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandRaisingHandler } from '@logic/HandRaisingHandler.js';
import { MockFactory } from './factories/MockFactory.ts';

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

        const meeting = MockFactory.createStoredMeeting({
            _id: 123,
            characters: [{ id: 'chair', name: 'Chair', voice: 'alloy' }],
            state: {},
            conversation: []
        });

        mockContext = {
            meeting,
            handRaised: false,
            serverOptions: MockFactory.createServerOptions({
                raiseHandPrompt: { en: "Prompt [NAME]" },
                raiseHandInvitationLength: 50
            }),
            broadcaster: mockBroadcaster,
            dialogGenerator: mockDialogGenerator,
            audioSystem: mockAudioSystem,
            services: {
                meetingsCollection: mockMeetingsCollection
            },
            environment: 'production'
        };

        handler = new HandRaisingHandler(mockContext);
    });

    it('should handle raise hand, truncate conversation, and generate invitation', async () => {
        mockContext.meeting.conversation = [
            { id: 1, text: 'msg1' },
            { id: 2, text: 'msg2' },
            { id: 3, text: 'msg3' }
        ];

        await handler.handleRaiseHand({ index: 2, humanName: "Human" });

        expect(mockContext.handRaised).toBe(true);
        expect(mockContext.meeting.conversation.length).toBe(4);

        const invitation = mockContext.meeting.conversation[2];
        expect(invitation.type).toBe('invitation');
        expect(invitation.text).toBe('Speak now.');

        const awaiting = mockContext.meeting.conversation[3];
        expect(awaiting.type).toBe('awaiting_human_question');

        expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(mockContext.meeting.conversation);
        expect(mockMeetingsCollection.updateOne).toHaveBeenCalledWith(
            { _id: 123 },
            expect.objectContaining({ $set: expect.anything() })
        );
        expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalled();
    });

    it('should not regenerate invitation if already invited', async () => {
        mockContext.meeting.state = { ...mockContext.meeting.state, alreadyInvited: true };
        mockContext.meeting.conversation = [{ text: 'msg1' }];

        await handler.handleRaiseHand({ index: 1, humanName: "Human" });

        expect(mockDialogGenerator.chairInterjection).not.toHaveBeenCalled();
        expect(mockContext.meeting.conversation).toHaveLength(2);
        expect(mockContext.meeting.conversation[1].type).toBe('awaiting_human_question');
    });
});
