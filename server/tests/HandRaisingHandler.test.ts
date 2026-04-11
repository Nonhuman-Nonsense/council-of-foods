import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandRaisingHandler } from '../src/logic/HandRaisingHandler.js';
import type { IMeetingManager } from '../src/interfaces/MeetingInterfaces.js';

describe('HandRaisingHandler', () => {
    let mockManager: IMeetingManager;
    let handler: HandRaisingHandler;

    beforeEach(() => {
        mockManager = {
            meeting: {
                _id: 123,
                language: 'sv',
                characters: [{ id: 'chair', name: 'Chair' }],
                conversation: [],
                state: { alreadyInvited: false, humanName: '' },
            } as any,
            handRaised: false,
            environment: 'test',
            socket: { emit: vi.fn() } as any,
            audioSystem: { queueAudioGeneration: vi.fn() } as any,
            services: { meetingsCollection: { updateOne: vi.fn() } } as any,
            dialogGenerator: {
                chairInterjection: vi.fn().mockResolvedValue({ response: "Hello [NAME]", id: "msg_123" }),
            } as any,
            serverOptions: {
                raiseHandPrompt: {
                    en: "Invite [NAME]",
                    sv: "Bjud in [NAME]",
                },
                raiseHandInvitationLength: 100,
            } as any,
            broadcaster: {
                broadcastConversationUpdate: vi.fn(),
            } as any,
        } as unknown as IMeetingManager;

        handler = new HandRaisingHandler(mockManager);
    });

    it('should successfully handle raise hand in Swedish when prompts exist', async () => {
        await handler.handleRaiseHand({ index: 0, humanName: "Sven" });
        expect(mockManager.dialogGenerator.chairInterjection).toHaveBeenCalled();
        expect(mockManager.meeting!.state.alreadyInvited).toBe(true);
    });

    it('should use the language-specific prompt', async () => {
        await handler.handleRaiseHand({ index: 0, humanName: "Sven" });
        const callArgs = (mockManager.dialogGenerator.chairInterjection as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[0]).toContain("Sven");
        expect(callArgs[0]).toContain("Bjud in");
    });
});
