
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandRaisingHandler } from '../../src/logic/HandRaisingHandler.js';
import { IMeetingManager, ConversationOptions } from '../../src/interfaces/MeetingInterfaces.js';

describe('HandRaisingHandler', () => {
    let mockManager: IMeetingManager;
    let handler: HandRaisingHandler;

    beforeEach(() => {
        mockManager = {
            meetingId: 123,
            conversation: [],
            handRaised: false,
            socket: { emit: vi.fn() } as any,
            audioSystem: { queueAudioGeneration: vi.fn() } as any,
            services: { meetingsCollection: { updateOne: vi.fn() } } as any,
            dialogGenerator: { chairInterjection: vi.fn().mockResolvedValue({ response: "Hello [NAME]", id: "msg_123" }) } as any,
            conversationOptions: {
                language: 'sv',
                state: {},
                characters: [{ id: 'chair', name: 'Chair' }],
                options: {
                    // Simulating a potential missing key scenario or structure mismatch
                    raiseHandPrompt: {
                        en: "Invite [NAME]",
                        // sv intentionally omitted to test if this reproduces likely cause, 
                        // or if it fails even WITH sv present due to some other access issue.
                        // But first let's see if providing it works, then remove it to reproduce.
                        sv: "Bjud in [NAME]"
                    },
                    raiseHandInvitationLength: 100
                }
            } as any
        } as unknown as IMeetingManager;

        handler = new HandRaisingHandler(mockManager);
    });

    it('should successfully handle raise hand in Swedish when prompts exist', async () => {
        await handler.handleRaiseHand({ index: 0, humanName: "Sven" });
        expect(mockManager.dialogGenerator.chairInterjection).toHaveBeenCalled();
        expect(mockManager.conversationOptions.state?.alreadyInvited).toBe(true);
    });

    it('should NOT crash when Swedish prompt is MISSING (Fallback test)', async () => {
        // Remove sv prompt
        // @ts-ignore
        delete mockManager.conversationOptions.options.raiseHandPrompt.sv;

        // Should succeed now due to fallback
        await handler.handleRaiseHand({ index: 0, humanName: "Sven" });
        expect(mockManager.dialogGenerator.chairInterjection).toHaveBeenCalled();
    });
});
