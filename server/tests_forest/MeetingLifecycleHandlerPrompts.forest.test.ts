import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeetingLifecycleHandler } from "@logic/MeetingLifecycleHandler.js";
import type { IMeetingManager } from "@interfaces/MeetingInterfaces.js";

describe("MeetingLifecycleHandler prompts (forest / Swedish)", () => {
    let mockManager: IMeetingManager;
    let handler: MeetingLifecycleHandler;

    beforeEach(() => {
        mockManager = {
            meeting: {
                _id: 123,
                language: "sv",
                characters: [{ id: "mock-char", name: "Mock Char" }],
                conversation: [],
                state: {},
            },
            environment: "test",
            socket: { emit: vi.fn(), on: vi.fn() },
            services: {
                meetingsCollection: { updateOne: vi.fn() },
                getOpenAI: vi.fn().mockReturnValue({ apiKey: "mock-key" }),
            },
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
            },
            dialogGenerator: {
                chairInterjection: vi.fn().mockResolvedValue({ response: "Summary text", id: "msg_456" }),
            },
            audioSystem: { generateAudio: vi.fn() },
            broadcaster: {
                broadcastConversationUpdate: vi.fn(),
                broadcastError: vi.fn(),
            },
        } as unknown as IMeetingManager;

        handler = new MeetingLifecycleHandler(mockManager);
    });

    it("calls chairInterjection with the Swedish finalizeMeetingPrompt", async () => {
        await handler.handleWrapUpMeeting({ date: "2024-01-01" });
        const callArgs = (mockManager.dialogGenerator.chairInterjection as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[0]).toContain("Sammanfatta");
        expect(callArgs[0]).toContain("2024-01-01");
    });
});
