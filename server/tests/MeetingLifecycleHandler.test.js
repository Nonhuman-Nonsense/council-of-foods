import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingLifecycleHandler } from '@logic/MeetingLifecycleHandler.js';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn((...args) => console.log('[MockLoggerError]', ...args)),
        warn: vi.fn()
    }
}));

describe('MeetingLifecycleHandler', () => {
    let handler;
    let mockContext;
    let mockBroadcaster;
    let mockMeetingsCollection;
    let mockAudioCollection;

    beforeEach(() => {
        mockBroadcaster = {
            broadcastMeetingStarted: vi.fn(),
            broadcastConversationUpdate: vi.fn(),
            broadcastConversationEnd: vi.fn(),
            broadcastMeetingNotFound: vi.fn(),
            broadcastClientKey: vi.fn(),
            broadcastError: vi.fn()
        };

        mockMeetingsCollection = {
            findOne: vi.fn(),
            insertOne: vi.fn(),
            updateOne: vi.fn()
        };

        mockAudioCollection = {
            deleteMany: vi.fn()
        };

        mockContext = {
            meetingId: null,
            conversation: [],
            conversationOptions: {},
            services: {
                meetingsCollection: mockMeetingsCollection,
                audioCollection: mockAudioCollection,
                insertMeeting: vi.fn()
            },
            broadcaster: mockBroadcaster,
            startLoop: vi.fn(),
            environment: 'prod',
            socket: { id: 'socket1' }, // Fallback if handler uses it for logging
            extraMessageCount: 0,
            isPaused: false,
            globalOptions: { extraMessageCount: 5 },
            dialogGenerator: { chairInterjection: vi.fn().mockResolvedValue({ response: 'Summary', id: 'sum1' }) },
            audioSystem: { generateAudio: vi.fn() }
        };

        mockContext.conversationOptions = {
            options: {
                conversationMaxLength: 10,
                extraMessageCount: 5,
                finalizeMeetingPrompt: { en: "Summary [DATE]" }
            },
            language: 'en',
            characters: [{ id: 'char1', name: 'Chair' }]
        };

        handler = new MeetingLifecycleHandler(mockContext);
    });

    describe('handleStartConversation', () => {
        it('should initialize conversation and save to DB', async () => {
            const setupOptions = {
                topic: 'Test Topic',
                characters: [{ id: 'char1', name: 'Char1', type: 'assistant', prompt: 'Prompt', voice: 'Voice' }],
                options: { greeting: 'Hello' }
            };

            mockContext.services.insertMeeting.mockResolvedValue({ insertedId: 101 });

            await handler.handleStartConversation(setupOptions);

            expect(mockContext.meetingId).toBe(101);
            expect(mockBroadcaster.broadcastMeetingStarted).toHaveBeenCalledWith(101);
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });

    describe('handleWrapUpMeeting', () => {
        it('should update DB and broadcast end', async () => {
            mockContext.meetingId = 101;
            mockContext.conversation = [{ id: '1', text: 'hi' }];

            await handler.handleWrapUpMeeting({});

            expect(mockMeetingsCollection.updateOne).toHaveBeenCalled();
        });
    });

    describe('handleContinueConversation', () => {
        it('should resume loop', () => {
            handler.handleContinueConversation();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });
});
