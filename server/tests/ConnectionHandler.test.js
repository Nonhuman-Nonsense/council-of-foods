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
            queueAudioGeneration: vi.fn()
        };

        mockContext = {
            meeting: null,
            isLoopActive: false,
            handRaised: false,
            extraMessageCount: 0,
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
        it('should set isLoopActive to false', () => {
            mockContext.isLoopActive = true;
            handler.handleDisconnect();
            expect(mockContext.isLoopActive).toBe(false);
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

            const ok = await handler.handleReconnection({ meetingId: 123, creatorKey: savedMeeting.creatorKey });

            expect(ok).toBe(true);
            expect(mockContext.meeting._id).toBe(123);
            expect(mockContext.meeting.conversation).toEqual(savedMeeting.conversation);
            expect(mockContext.serverOptions).toBe(optsBefore);

            expect(mockContext.startLoop).toHaveBeenCalled();
            expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(savedMeeting.conversation);
        });

        it('should broadcast notification if meeting not found', async () => {
            mockMeetingsCollection.findOne.mockResolvedValue(null);

            const ok = await handler.handleReconnection({ meetingId: 999, creatorKey: 'any' });

            expect(ok).toBe(false);
            expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith('Meeting not found', 404);
            expect(mockContext.meeting).toBeNull();
        });

        it('should broadcast Forbidden when creatorKey does not match', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                creatorKey: 'real-key',
                conversation: [],
                audio: [],
            });
            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, creatorKey: 'wrong-key' });

            expect(ok).toBe(false);
            expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith('Forbidden', 403);
            expect(mockContext.meeting).toBeNull();
        });

        it('should queue missing audio generation', async () => {
            const savedMeeting = MockFactory.createStoredMeeting({
                _id: 123,
                conversation: [
                    { id: 'msg1', text: 'Has Audio', sentences: [], speaker: 'water' },
                    { id: 'msg2', text: 'Missing Audio', sentences: [], speaker: 'potato' }
                ],
                characters: [
                    { id: 'water', name: 'Water', voice: 'alloy' },
                    { id: 'potato', name: 'Potato', voice: 'alloy' }
                ],
                audio: ['msg1']
            });

            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            const ok = await handler.handleReconnection({ meetingId: 123, creatorKey: savedMeeting.creatorKey });

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
    });
});
