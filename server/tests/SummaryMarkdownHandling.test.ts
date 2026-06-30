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
        const chair = MockFactory.createChair();
        const mockManager = {
            meeting: MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [
                    { id: 'm1', type: 'message', text: 'prior', speaker: chair.id },
                    { type: 'query_extension' },
                ],
                characters: [chair]
            }),
            serverOptions: MockFactory.createServerOptions({
                concludeMeetingPrompt: { en: 'Closing' },
                concludeMeetingLength: 50,
                summarizeMeetingPrompt: { en: 'Prompt [DATE]' },
                summarizeMeetingLength: 100
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
                chairInterjection: vi.fn()
                    .mockResolvedValueOnce({ response: 'Thank you.', id: 'close1' }),
                generateDocument: vi.fn()
                    .mockResolvedValueOnce({
                        response: 'This is **bold** and *italic*.',
                        id: 'summary-1',
                    }),
            },
            audioSystem: {
                generateAudio: vi.fn(),
                queueAudioGeneration: vi.fn()
            },
            environment: 'test'
        };

        const handler = new MeetingLifecycleHandler(mockManager as any);

        await handler.handleConcludeMeeting({ date: '2023-01-01' } as any);

        expect(mockManager.meeting.conversation.length).toBe(3);
        expect(mockManager.meeting.conversation[0].text).toBe('prior');
        expect(mockManager.meeting.conversation[1].type).toBe('message');
        expect(mockManager.meeting.conversation[1].text).toBe('Thank you.');
        expect(mockManager.meeting.conversation[2].type).toBe('summary');
        expect(mockManager.meeting.conversation[2].text).toBe('This is **bold** and *italic*.');

        expect(mockManager.audioSystem.generateAudio).toHaveBeenCalledTimes(1);
        const audioCallArgs = (mockManager.audioSystem.generateAudio as any).mock.calls[0];
        const audioMessage = audioCallArgs[0];

        expect(audioMessage.text).toBe('This is bold and italic.');
        expect(audioMessage.text).not.toContain('**');
        expect(audioMessage.text).not.toContain('*');
    });
});
