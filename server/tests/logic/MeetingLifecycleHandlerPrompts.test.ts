import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingLifecycleHandler } from '../../src/logic/MeetingLifecycleHandler.js';
import type { IMeetingManager } from '../../src/interfaces/MeetingInterfaces.js';

describe('MeetingLifecycleHandler Prompts', () => {
    let mockManager: IMeetingManager;
    let handler: MeetingLifecycleHandler;

    beforeEach(() => {
        mockManager = {
            meeting: {
                _id: 123,
                language: 'sv',
                characters: [{ id: 'mock-char', name: 'Mock Char' }],
                conversation: [],
                state: {},
            } as any,
            environment: 'test',
            socket: { emit: vi.fn(), on: vi.fn() } as any,
            services: {
                meetingsCollection: { updateOne: vi.fn() },
                getOpenAI: vi.fn().mockReturnValue({ apiKey: "mock-key" }),
            } as any,
            serverOptions: {
                finalizeMeetingPrompt: {
                    en: "Summarize [DATE]",
                    sv: "Sammanfatta [DATE]",
                },
                finalizeMeetingLength: 5,
                transcribeModel: "whisper-1",
                transcribePrompt: {
                    en: "Transcribe",
                    sv: "Transkribera",
                },
            } as any,
            dialogGenerator: {
                chairInterjection: vi.fn().mockResolvedValue({ response: "Summary text", id: "msg_456" }),
            } as any,
            audioSystem: { generateAudio: vi.fn() } as any,
            broadcaster: {
                broadcastConversationUpdate: vi.fn(),
                broadcastError: vi.fn(),
                broadcastClientKey: vi.fn(),
            } as any,
        } as unknown as IMeetingManager;

        handler = new MeetingLifecycleHandler(mockManager);
    });

    it('should call chairInterjection with the Swedish finalizeMeetingPrompt', async () => {
        await handler.handleWrapUpMeeting({ date: "2024-01-01" });
        const callArgs = (mockManager.dialogGenerator.chairInterjection as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[0]).toContain("Sammanfatta");
        expect(callArgs[0]).toContain("2024-01-01");
    });

    it('should broadcast client key using the Swedish transcribePrompt', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ client_secret: { value: "secret" } }),
        });

        await handler.handleRequestClientKey();
        expect(mockManager.broadcaster.broadcastClientKey).toHaveBeenCalledWith(expect.anything());
    });
});
