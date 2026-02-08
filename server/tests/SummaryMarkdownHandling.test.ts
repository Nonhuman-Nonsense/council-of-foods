import { describe, it, expect, vi } from 'vitest';
import { MeetingLifecycleHandler } from '@root/src/logic/MeetingLifecycleHandler.js';

// Mock Logger
vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

describe('Summary Markdown Handling', () => {
    it('should keep markdown for client but strip it for audio', async () => {
        // Mock Manager Context
        const mockManager = {
            meetingId: 123,
            conversation: [] as any[],
            conversationOptions: {
                options: {
                    finalizeMeetingPrompt: { en: "Prompt" },
                    finalizeMeetingLength: 100
                },
                language: 'en',
                characters: [{ id: 'chair', name: 'Chair' }]
            },
            broadcaster: {
                broadcastConversationUpdate: vi.fn()
            },
            services: {
                meetingsCollection: {
                    updateOne: vi.fn()
                }
            },
            dialogGenerator: {
                chairInterjection: vi.fn().mockResolvedValue({
                    response: 'This is **bold** and *italic*.',
                    id: 'summary-1'
                })
            },
            audioSystem: {
                generateAudio: vi.fn()
            }
        };

        const handler = new MeetingLifecycleHandler(mockManager as any);

        // Act
        await handler.handleWrapUpMeeting({ date: '2023-01-01' } as any);

        // Assert 1: Conversation should have Markdown (for client display)
        expect(mockManager.conversation.length).toBe(1);
        expect(mockManager.conversation[0].text).toBe('This is **bold** and *italic*.');

        // Assert 2: AudioSystem should receive Stripped Text
        expect(mockManager.audioSystem.generateAudio).toHaveBeenCalledTimes(1);
        const audioCallArgs = (mockManager.audioSystem.generateAudio as any).mock.calls[0];
        const audioMessage = audioCallArgs[0];

        expect(audioMessage.text).toBe('This is bold and italic.');
        expect(audioMessage.text).not.toContain('**');
        expect(audioMessage.text).not.toContain('*');
    });
});
