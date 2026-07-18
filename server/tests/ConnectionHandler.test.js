import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionHandler } from '@logic/ConnectionHandler.js';
import { MockFactory } from './factories/MockFactory.ts';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn((...args) => console.log('[MockLoggerError]', ...args)),
        warn: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

describe('ConnectionHandler', () => {
    let handler;
    let mockContext;
    let mockBroadcaster;
    let mockMeetingsCollection;
    let mockAudioSystem;

    beforeEach(() => {
        mockBroadcaster = {
            broadcastConversationUpdate: vi.fn(),
            broadcastError: vi.fn()
        };

        mockMeetingsCollection = {
            findOne: vi.fn(),
            updateOne: vi.fn()
        };

        mockAudioSystem = {
            queueAudioGeneration: vi.fn(),
            waitForIdle: vi.fn().mockResolvedValue(undefined)
        };

        mockContext = {
            meeting: null,
            isActive: true,
            handRaised: false,
            serverOptions: MockFactory.createServerOptions({ conversationMaxLength: 50 }),
            broadcaster: mockBroadcaster,
            audioSystem: mockAudioSystem,
            services: {
                meetingsCollection: mockMeetingsCollection
            },
            startLoop: vi.fn(),
            environment: 'test'
        };

        handler = new ConnectionHandler(mockContext);
    });

    describe('handleDisconnect', () => {
        it('should set isActive to false', () => {
            mockContext.isActive = true;
            handler.handleDisconnect();
            expect(mockContext.isActive).toBe(false);
        });
    });

    describe('handleReconnection', () => {
        it('should restore state from database when meeting exists', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [{ id: 'msg1', text: 'Hello' }],
                date: new Date().toISOString(),
                audio: ['msg1']
            });
            const optsBefore = mockContext.serverOptions;

            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, liveKey: savedMeeting.liveKey });

            expect(ok).toBe(true);
            expect(mockContext.meeting._id).toBe(123);
            expect(mockContext.meeting.conversation).toEqual(savedMeeting.conversation);
            expect(mockContext.serverOptions).toBe(optsBefore);

            expect(mockContext.startLoop).toHaveBeenCalled();
            expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(savedMeeting.conversation);
        });

        it('heals a concluded-but-unpromoted meeting on reconnect (promotes meetingComplete)', async () => {
            // Crash landed after the summary was written but before meetingComplete was set:
            // the tail is a real summary (no summary_pending marker), so the loop won't re-run
            // GENERATE_SUMMARY. Reconnect must regenerate missing audio, drain, and promote.
            const concluded = MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [
                    { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                    { id: 'sum1', type: 'summary', speaker: 'chair', text: 'Summary', sentences: [] },
                ],
                audio: ['m0', 'sum1'],
                maximumPlayedIndex: 1,
                meetingComplete: false,
            });
            mockMeetingsCollection.findOne.mockResolvedValue(concluded);

            const ok = await handler.handleReconnection({ meetingId: 123, liveKey: concluded.liveKey });

            expect(ok).toBe(true);
            expect(mockAudioSystem.waitForIdle).toHaveBeenCalled();
            expect(mockMeetingsCollection.updateOne).toHaveBeenCalledWith(
                { _id: 123 },
                { $set: { meetingComplete: true } },
            );
        });

        it('does NOT run the promotion path for a mid-meeting reconnect', async () => {
            const midMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [
                    { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                    { id: 'm1', type: 'message', speaker: 'tomato', text: 'there' },
                ],
                audio: ['m0', 'm1'],
                meetingComplete: false,
            });
            mockMeetingsCollection.findOne.mockResolvedValue(midMeeting);

            await handler.handleReconnection({ meetingId: 123, liveKey: midMeeting.liveKey });

            expect(mockAudioSystem.waitForIdle).not.toHaveBeenCalled();
            expect(mockMeetingsCollection.updateOne).not.toHaveBeenCalledWith(
                { _id: 123 },
                { $set: { meetingComplete: true } },
            );
        });

        it('should broadcast notification if meeting not found', async () => {
            mockMeetingsCollection.findOne.mockResolvedValue(null);

            const ok = await handler.handleReconnection({ meetingId: 999, liveKey: 'any' });

            expect(ok).toBe(false);
            expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith(
                expect.objectContaining({ clientMessage: 'Meeting not found', statusCode: 404 }),
            );
            expect(mockContext.meeting).toBeNull();
        });

        it('should broadcast Forbidden when liveKey does not match', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                liveKey: 'real-key',
                conversation: [],
                audio: [],
            });
            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, liveKey: 'wrong-key' });

            expect(ok).toBe(false);
            expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith(
                expect.objectContaining({ clientMessage: 'Forbidden', statusCode: 403 }),
            );
            expect(mockContext.meeting).toBeNull();
        });

        it('should queue missing audio generation', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [
                    { id: 'msg1', text: 'Has Audio', sentences: [], speaker: 'speaker1' },
                    { id: 'msg2', text: 'Missing Audio', sentences: [], speaker: 'speaker2' }
                ],
                characters: [
                    { id: 'speaker1', name: 'Speaker 1', description: '', prompt: '', voice: 'alloy' },
                    { id: 'speaker2', name: 'Speaker 2', description: '', prompt: '', voice: 'alloy' }
                ],
                audio: ['msg1']
            });

            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, liveKey: savedMeeting.liveKey });

            expect(ok).toBe(true);
            expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'msg2' }),
                expect.anything(),
                expect.objectContaining({ _id: 123 }),
                expect.anything(),
                mockContext.serverOptions
            );
            expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalledTimes(1);
        });

        it('loads meeting document with persisted conversationExtraSlots unchanged', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                conversationExtraSlots: 12,
                conversation: [],
                audio: [],
            });
            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, liveKey: savedMeeting.liveKey });

            expect(ok).toBe(true);
            expect(mockContext.meeting?.conversationExtraSlots).toBe(12);
        });
    });
});
