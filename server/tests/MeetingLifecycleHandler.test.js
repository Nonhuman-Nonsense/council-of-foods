import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingLifecycleHandler } from '@logic/MeetingLifecycleHandler.js';
import { Logger } from '@utils/Logger.js';
import { MockFactory } from './factories/MockFactory.ts';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn((...args) => console.log('[MockLoggerError]', ...args)),
        warn: vi.fn(),
        staleEvent: vi.fn()
    }
}));

describe('MeetingLifecycleHandler', () => {
    let handler;
    let mockContext;
    let mockBroadcaster;
    let mockMeetingsCollection;
    let mockAudioCollection;
    const chair = MockFactory.createChair();

    const sessionServerOptions = () =>
        MockFactory.createServerOptions({
            extraMessageCount: 5,
            concludeMeetingPrompt: { en: 'Closing meeting #[MEETING_ID]' },
            concludeMeetingLength: 10,
            summarizeMeetingPrompt: { en: 'Summary [DATE]' },
            summarizeMeetingLength: 10,
            conversationMaxLength: 10
        });

    const storedMeeting = (overrides = {}) =>
        MockFactory.createStoredMeeting({
            _id: 101,
            liveKey: 'test-live-key',
            conversation: [],
            characters: [MockFactory.createChair()],
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
                chairInterjection: vi.fn()
                    .mockResolvedValueOnce({ response: 'Thank you all for a rich discussion.', id: 'close1' }),
                generateDocument: vi.fn()
                    .mockResolvedValue({ response: 'Summary', id: 'sum1' }),
            },
            audioSystem: {
                generateAudio: vi.fn().mockResolvedValue(undefined),
                waitForIdle: vi.fn().mockResolvedValue(undefined),
                queueAudioGeneration: vi.fn(),
            }
        };

        handler = new MeetingLifecycleHandler(mockContext);
        Logger.staleEvent.mockClear();
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

    describe('handleConcludeMeeting', () => {
        it('should update DB after summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: '1', text: 'hi', type: 'message', speaker: chair.id },
                    { type: 'query_extension' },
                ],
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            expect(mockMeetingsCollection.updateOne).toHaveBeenCalled();
        });

        it('should strip query_extension before appending closing and summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: '1', text: 'hi', type: 'message', speaker: chair.id },
                    { type: 'query_extension' }
                ]
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message', 'message', 'summary']);
            expect(mockContext.meeting.conversation[1].text).toBe('Thank you all for a rich discussion.');
        });

        it('broadcasts closing before summary is generated', async () => {
            let finishSummary;
            mockContext.dialogGenerator.chairInterjection = vi.fn()
                .mockResolvedValueOnce({ response: 'Closing line', id: 'close1' });
            mockContext.dialogGenerator.generateDocument = vi.fn()
                .mockReturnValue(new Promise((resolve) => {
                    finishSummary = () => resolve({ response: 'Summary', id: 'sum1' });
                }));
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: chair.id }],
            });

            const concludeMeeting = handler.handleConcludeMeeting({ date: '2025-01-01' });
            await Promise.resolve();

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message', 'message']);
            expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledTimes(1);

            finishSummary();
            await concludeMeeting;

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message', 'message', 'summary']);
            expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledTimes(2);
        });

        it('appends closing and summary without query_extension sentinel at hard cap auto conclude', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: chair.id }],
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            expect(mockContext.meeting.conversation.map((m) => m.type)).toEqual(['message', 'message', 'summary']);
        });

        it('passes trimmed content through on closing message when chair interjection overflows', async () => {
            mockContext.dialogGenerator.chairInterjection = vi.fn()
                .mockResolvedValueOnce({
                    response: 'Thank you all.',
                    trimmed: '\n\nExtra closing thoughts.',
                    id: 'close1',
                });
            mockContext.dialogGenerator.generateDocument = vi.fn()
                .mockResolvedValueOnce({ response: 'Summary', id: 'sum1' });
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: chair.id }],
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            expect(mockContext.meeting.conversation[1].trimmed).toBe('\n\nExtra closing thoughts.');
        });

        it('calls chairInterjection for closing then generateDocument for summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: chair.id }],
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            expect(mockContext.dialogGenerator.chairInterjection).toHaveBeenCalledTimes(1);
            expect(mockContext.dialogGenerator.chairInterjection.mock.calls[0][0]).toBe('Closing meeting #101');
            expect(mockContext.dialogGenerator.generateDocument).toHaveBeenCalledTimes(1);
            expect(mockContext.dialogGenerator.generateDocument.mock.calls[0][0]).toBe('Summary 2025-01-01');
            expect(mockContext.audioSystem.queueAudioGeneration).toHaveBeenCalledTimes(1);
            expect(mockContext.audioSystem.generateAudio).toHaveBeenCalledTimes(1);
        });

        it('sets maximumPlayedIndex to the summary message index when persisting summary', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: '1', text: 'hi', type: 'message', speaker: chair.id }],
            });

            await handler.handleConcludeMeeting({ date: '2025-01-01' });

            const summaryIndex = mockContext.meeting.conversation.length - 1;
            expect(mockContext.meeting.conversation[summaryIndex].type).toBe('summary');
            expect(mockContext.meeting.maximumPlayedIndex).toBe(summaryIndex);

            const summaryUpdate = mockMeetingsCollection.updateOne.mock.calls.find(
                ([, update]) => update?.$set?.maximumPlayedIndex != null && update?.$set?.conversation != null,
            );
            expect(summaryUpdate).toBeDefined();
            expect(summaryUpdate[1].$set.summary).toBeUndefined();
            expect(summaryUpdate[1].$set.maximumPlayedIndex).toBe(summaryIndex);
        });
    });

    describe('handleExtendMeeting', () => {
        it('should resume loop when meeting is at query_extension', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: 'a', type: 'message', text: 'x', speaker: chair.id },
                    { type: 'query_extension' },
                ],
            });
            await handler.handleExtendMeeting();
            expect(mockContext.startLoop).toHaveBeenCalled();
        });

        it('drops stale extend_meeting without crashing client and delegates to Logger.staleEvent', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [{ id: 'a', type: 'message', text: 'x', speaker: chair.id }],
            });
            mockContext.lastReconnectionAt = 987654;

            await expect(handler.handleExtendMeeting()).resolves.toBeUndefined();

            expect(mockContext.startLoop).not.toHaveBeenCalled();
            expect(mockBroadcaster.broadcastError).not.toHaveBeenCalled();
            expect(Logger.staleEvent).toHaveBeenCalledWith(
                expect.any(String),
                'extend_meeting',
                expect.stringContaining('no query_extension sentinel'),
                expect.objectContaining({ lastReconnectionAt: 987654 }),
            );
        });

        it('should strip query_extension, persist slots, then resume', async () => {
            mockContext.meeting = storedMeeting({
                conversation: [
                    { id: 'a', type: 'message', text: 'x', speaker: chair.id },
                    { type: 'query_extension' },
                ],
            });
            mockMeetingsCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

            await handler.handleExtendMeeting();

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
