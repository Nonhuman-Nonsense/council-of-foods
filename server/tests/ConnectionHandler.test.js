import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionHandler } from '@logic/ConnectionHandler.js';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn((...args) => console.log('[MockLoggerError]', ...args)),
        warn: vi.fn()
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
            meetingId: null,
            conversation: [],
            conversationOptions: {},
            meetingDate: null,
            isLoopActive: false,
            handRaised: false,
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
            const savedMeeting = {
                _id: 123,
                conversation: [{ id: 'msg1', text: 'Hello' }],
                options: {
                    options: { conversationMaxLength: 50 },
                    characters: []
                },
                date: new Date().toISOString(),
                audio: ['msg1']
            };

            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            await handler.handleReconnection({ meetingId: '123' });

            expect(mockContext.meetingId).toBe(123);
            expect(mockContext.conversation).toEqual(savedMeeting.conversation);
            expect(mockContext.conversationOptions).toEqual(savedMeeting.options);
            expect(mockContext.meetingDate.toISOString()).toEqual(savedMeeting.date);
            expect(mockContext.meetingDate.toISOString()).toEqual(savedMeeting.date);

            // ConnectionHandler now calls startLoop, which sets isLoopActive=true
            expect(mockContext.startLoop).toHaveBeenCalled();

            expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(savedMeeting.conversation);
        });

        it('should broadcast notification if meeting not found', async () => {
            mockMeetingsCollection.findOne.mockResolvedValue(null);

            await handler.handleReconnection({ meetingId: 'invalid123' });

            expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith('Meeting not found', 404);
            expect(mockContext.meetingId).toBeNull();
        });

        it('should queue missing audio generation', async () => {
            const savedMeeting = {
                _id: 123,
                conversation: [
                    { id: 'msg1', text: 'Has Audio', sentences: [], speaker: 'water' },
                    { id: 'msg2', text: 'Missing Audio', sentences: [], speaker: 'potato' }
                ],
                options: { options: {}, characters: [{ id: 'water', name: 'Water' }, { id: 'potato', name: 'Potato' }] },
                date: new Date().toISOString(),
                audio: ['msg1'] // msg2 missing
            };

            mockMeetingsCollection.findOne.mockResolvedValue(savedMeeting);

            await handler.handleReconnection({ meetingId: '123' });

            // msg2 has no audio ID in the 'audio' list.
            expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'msg2' }),
                expect.anything(),
                expect.anything(),
                123,
                expect.anything()
            );
            // msg1 should not be queued
            expect(mockAudioSystem.queueAudioGeneration).toHaveBeenCalledTimes(1);
        });
    });
});
