import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingLifecycleHandler } from '@logic/MeetingLifecycleHandler.js';
import { MockFactory } from './factories/MockFactory.ts';

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

    const sessionServerOptions = () =>
        MockFactory.createServerOptions({
            extraMessageCount: 5,
            finalizeMeetingPrompt: { en: 'Summary [DATE]' },
            finalizeMeetingLength: 10,
            conversationMaxLength: 10
        });

    const storedMeeting = (overrides = {}) =>
        MockFactory.createStoredMeeting({
            _id: 101,
            creatorKey: 'test-creator-key',
            conversation: [],
            characters: [MockFactory.createCharacter({ id: 'chair', name: 'Chair' })],
            ...overrides
        });

    beforeEach(() => {
        mockBroadcaster = {
            broadcastMeetingStarted: vi.fn(),
            broadcastConversationUpdate: vi.fn(),
            broadcastConversationEnd: vi.fn(),
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
            meeting: null,
            serverOptions: sessionServerOptions(),
            socket: { id: 'socket1' },
            environment: 'test',
            extraMessageCount: 0,
            isPaused: false,
            broadcaster: mockBroadcaster,
            services: {
                meetingsCollection: mockMeetingsCollection,
                audioCollection: mockAudioCollection,
                insertMeeting: vi.fn()
            },
            startLoop: vi.fn(),
            dialogGenerator: {
                chairInterjection: vi.fn().mockResolvedValue({ response: 'Summary', id: 'sum1' })
            },
            audioSystem: { generateAudio: vi.fn() }
        };

        handler = new MeetingLifecycleHandler(mockContext);
    });

    describe('handleStartConversation', () => {
        it('should load meeting from DB, attach to manager, and start loop', async () => {
            const doc = storedMeeting();
            const optsBefore = mockContext.serverOptions;
            mockMeetingsCollection.findOne.mockResolvedValue(doc);

            await handler.handleStartConversation({ meetingId: 101, creatorKey: 'test-creator-key' });

            expect(mockMeetingsCollection.findOne).toHaveBeenCalledWith({ _id: 101 });
            expect(mockContext.meeting).toBe(doc);
            expect(mockContext.serverOptions).toBe(optsBefore);
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('should throw when creator key does not match the stored meeting', async () => {
            mockMeetingsCollection.findOne.mockResolvedValue(storedMeeting());

            await expect(
                handler.handleStartConversation({ meetingId: 101, creatorKey: 'wrong-key' })
            ).rejects.toThrow('Invalid creator key');

            expect(mockContext.startLoop).not.toHaveBeenCalled();
        });
    });

    describe('handleWrapUpMeeting', () => {
        it('should update DB after summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: 'chair' }]
            });

            await handler.handleWrapUpMeeting({ date: '2025-01-01' });

            expect(mockMeetingsCollection.updateOne).toHaveBeenCalled();
        });
    });

    describe('handleContinueConversation', () => {
        it('should resume loop when meeting is loaded', () => {
            mockContext.meeting = storedMeeting();
            handler.handleContinueConversation();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });
});
