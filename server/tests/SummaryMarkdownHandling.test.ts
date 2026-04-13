import { describe, it, expect, vi } from 'vitest';
import { MeetingLifecycleHandler } from '@root/src/logic/MeetingLifecycleHandler.js';
import { MockFactory } from './factories/MockFactory.js';

vi.mock('@root/src/utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

describe('Summary Markdown Handling', () => {
    it('should keep markdown for client but strip it for audio', async () => {
        const mockManager = {
            meeting: MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [],
                characters: [{ id: 'chair', name: 'Chair', voice: 'alloy' }]
            }),
            serverOptions: MockFactory.createServerOptions({
                finalizeMeetingPrompt: { en: 'Prompt [DATE]' },
                finalizeMeetingLength: 100
            }),
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
            },
            environment: 'test'
        };

        const handler = new MeetingLifecycleHandler(mockManager as any);

        await handler.handleWrapUpMeeting({ date: '2023-01-01' } as any);

        expect(mockManager.meeting.conversation.length).toBe(1);
        expect(mockManager.meeting.conversation[0].text).toBe('This is **bold** and *italic*.');

        expect(mockManager.audioSystem.generateAudio).toHaveBeenCalledTimes(1);
        const audioCallArgs = (mockManager.audioSystem.generateAudio as any).mock.calls[0];
        const audioMessage = audioCallArgs[0];

        expect(audioMessage.text).toBe('This is bold and italic.');
        expect(audioMessage.text).not.toContain('**');
        expect(audioMessage.text).not.toContain('*');
    });
});
