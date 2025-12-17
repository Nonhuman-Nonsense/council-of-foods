
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingLifecycleHandler } from '../../src/logic/MeetingLifecycleHandler';
import { IMeetingManager } from '../../src/interfaces/MeetingInterfaces';

describe('MeetingLifecycleHandler Prompts', () => {
    let mockManager: IMeetingManager;
    let handler: MeetingLifecycleHandler;

    beforeEach(() => {
        mockManager = {
            meetingId: 123,
            conversation: [],
            conversationOptions: {
                language: 'sv',
                options: {
                    finalizeMeetingPrompt: {
                        en: "Summarize"
                        // sv missing
                    },
                    transcribePrompt: {
                        en: "Transcribe"
                        // sv missing
                    }
                }
            },
            services: { meetingsCollection: { updateOne: vi.fn() } },
            socket: { emit: vi.fn(), on: vi.fn() },
            dialogGenerator: {
                generateTextFromGPT: vi.fn().mockResolvedValue({ response: "Summary" }),
                chairInterjection: vi.fn().mockResolvedValue({ response: "Summary", id: "123" }) // Correct mock return structure
            },
            connectionHandler: { handleRequestClientKey: vi.fn() }
        } as unknown as IMeetingManager;

        handler = new MeetingLifecycleHandler(mockManager);
    });

    it('should NOT crash when Swedish finalizeMeetingPrompt is MISSING (Fallback test)', async () => {
        // Mock a wrap up message
        const message = { date: "2023-01-01" };

        // This should NO LONGER crash accessing .replace on undefined
        await handler.handleWrapUpMeeting(message);
        expect(mockManager.dialogGenerator.chairInterjection).toHaveBeenCalled();
    });

    it('should NOT crash when Swedish transcribePrompt is MISSING (Fallback test)', async () => {
        // Mock fetch for requestClientKey
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ client_secret: { value: "secret" } })
        });

        await handler.handleRequestClientKey();
        expect(mockManager.socket.emit).toHaveBeenCalledWith("clientkey_response", expect.anything());
    });
});
