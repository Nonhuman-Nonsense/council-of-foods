import { describe, it, expect, vi, beforeEach } from 'vitest';
import { meetingsCollection } from '../src/services/DbService.js';
import { createTestManager, mockOpenAI } from './commonSetup.js';

// Mock dependencies
// vi.mock('../src/services/OpenAIService.js', () => ({
//     getOpenAI: vi.fn(() => mockOpenAI),
// }));

describe('MeetingManager - Hand Raising', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;

        // Spy on the real in-memory DB collection method logic
        vi.spyOn(meetingsCollection, 'updateOne');
    });

    describe('handleRaiseHand', () => {
        it('should truncate conversation and set state when hand is raised', async () => {
            // Setup conversion with 5 messages
            manager.conversation = [
                { id: 1, text: 'msg1' },
                { id: 2, text: 'msg2' },
                { id: 3, text: 'msg3' },
                { id: 4, text: 'msg4' },
                { id: 5, text: 'msg5' }
            ];
            manager.meetingId = "test_meeting";

            // Seed DB with initial state
            await meetingsCollection.insertOne({
                _id: "test_meeting",
                conversation: [...manager.conversation]
            });

            // Mock AudioSystem to avoid errors
            vi.spyOn(manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });
            // Mock generateTextFromGPT as a fallback (though current impl calls OpenAI directly)
            vi.spyOn(manager, 'generateTextFromGPT').mockResolvedValue({
                id: 'invitation_id',
                response: 'Speak now.',
                sentences: [],
                trimmed: 'Speak now.'
            });

            await manager.handRaisingHandler.handleRaiseHand({ index: 1, humanName: "Human" });

            expect(manager.handRaised).toBe(true);

            // If it sliced at 1: [msg1] + Invitation + Awaiting = 3.
            expect(manager.conversation.length).toBe(3);
            expect(manager.conversation[0].text).toBe('msg1');

            // Check Invitation (Chair Interjection)
            expect(manager.conversation[1].type).toBe('invitation');
            expect(manager.conversation[1].speaker).toBe('water'); // Chair

            // Check State Flag
            expect(manager.conversation[2].type).toBe('awaiting_human_question');

            // Check DB Persistence (Function Call)
            expect(meetingsCollection.updateOne).toHaveBeenCalledWith(
                { _id: "test_meeting" },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        conversation: manager.conversation
                    })
                })
            );

            // Check DB Persistence (Actual Document)
            const dbMeeting = await meetingsCollection.findOne({ _id: "test_meeting" });
            expect(dbMeeting).toBeDefined();
            expect(dbMeeting.conversation).toHaveLength(3);
            expect(dbMeeting.conversation[1].type).toBe('invitation');
            expect(dbMeeting.options.state.alreadyInvited).toBe(true);
        });

        it('should generate an invitation using GPT', async () => {
            manager.conversation = [{ text: 'msg1' }];
            manager.conversationOptions.options.raiseHandInvitationLength = 50;

            // Mock OpenAI response for invitation
            vi.spyOn(manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => { });

            await manager.handRaisingHandler.handleRaiseHand({ index: 0 });

            // chairInterjection calls OpenAI directly.
            // In MOCK mode, we verify the mock. In FAST mode, we verify the side effect (invitation added).
            const { getTestMode, TEST_MODES } = await import('./testUtils.js');
            if (getTestMode() === TEST_MODES.MOCK) {
                expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
                const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
                expect(callArgs.messages).toBeDefined();
            } else {
                // FAST mode: Verify invitation was generated and added to conversation
                const invitation = manager.conversation.find(m => m.type === 'invitation');
                expect(invitation).toBeDefined();
                expect(invitation.text).toBeTruthy();
            }
        });
    });
});
