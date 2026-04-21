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
            liveKey: 'test-live-key',
            conversation: [],
            characters: [MockFactory.createCharacter({ id: 'chair', name: 'Chair' })],
            ...overrides
        });

    beforeEach(() => {
        mockBroadcaster = {
            broadcastMeetingStarted: vi.fn(),
            broadcastConversationUpdate: vi.fn(),
            broadcastConversationEnd: vi.fn(),
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

            await handler.handleStartConversation({ meetingId: 101, liveKey: 'test-live-key' });

            expect(mockMeetingsCollection.findOne).toHaveBeenCalledWith({ _id: 101 });
            expect(mockContext.meeting).toBe(doc);
            expect(mockContext.serverOptions).toBe(optsBefore);
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('keeps conversationExtraSlots on the attached meeting document', async () => {
            const doc = storedMeeting({ conversationExtraSlots: 15 });
            mockMeetingsCollection.findOne.mockResolvedValue(doc);

            await handler.handleStartConversation({ meetingId: 101, liveKey: 'test-live-key' });

            expect(mockContext.meeting?.conversationExtraSlots).toBe(15);
        });

        it('should throw when live key does not match the stored meeting', async () => {
            mockMeetingsCollection.findOne.mockResolvedValue(storedMeeting());

            await expect(
                handler.handleStartConversation({ meetingId: 101, liveKey: 'wrong-key' })
            ).rejects.toThrow('Invalid live key');

            expect(mockContext.startLoop).not.toHaveBeenCalled();
        });
    });

    describe('handleWrapUpMeeting', () => {
        it('should update DB after summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: '1', text: 'hi', type: 'message', speaker: 'chair' },
                    { type: 'max_reached' },
                ],
            });

            await handler.handleWrapUpMeeting({ date: '2025-01-01' });

            expect(mockMeetingsCollection.updateOne).toHaveBeenCalled();
        });

        it('should strip max_reached before appending summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: '1', text: 'hi', type: 'message', speaker: 'chair' },
                    { type: 'max_reached' }
                ]
            });

            await handler.handleWrapUpMeeting({ date: '2025-01-01' });

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message', 'summary']);
        });

        it('throws when wrap-up is requested without max_reached sentinel', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: 'chair' }],
            });
            await expect(handler.handleWrapUpMeeting({ date: '2025-01-01' })).rejects.toThrow(
                'Attempted to wrap up meeting but not at max reached',
            );
        });
    });

    describe('handleContinueConversation', () => {
        it('should resume loop when meeting is at max_reached', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: 'a', type: 'message', text: 'x', speaker: 'chair' },
                    { type: 'max_reached' },
                ],
            });
            await handler.handleContinueConversation();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('throws when continue is requested without max_reached sentinel', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: 'a', type: 'message', text: 'x', speaker: 'chair' }],
            });
            await expect(handler.handleContinueConversation()).rejects.toThrow(
                'Attempted to continue meeting but not at max reached',
            );
        });

        it('should strip max_reached, persist slots, then resume', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: 'a', type: 'message', text: 'x', speaker: 'chair' },
                    { type: 'max_reached' },
                ],
            });
            mockMeetingsCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

            await handler.handleContinueConversation();

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message']);
            expect(mockContext.meeting.conversationExtraSlots).toBe(5);
            expect(mockMeetingsCollection.updateOne).toHaveBeenCalledWith(
                { _id: 101 },
                {
                    $set: expect.objectContaining({
                        conversation: mockContext.meeting.conversation,
                        conversationExtraSlots: 5,
                    }),
                },
            );
            expect(mockContext.startLoop).toHaveBeenCalled();
        });
    });
});
