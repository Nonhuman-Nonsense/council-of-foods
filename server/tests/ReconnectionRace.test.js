import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionHandler } from '../src/logic/ConnectionHandler.js';
import { MockFactory } from './factories/MockFactory.ts';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        reportAndCrashClient: vi.fn()
    }
}));

describe('ConnectionHandler - Race Condition', () => {
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
            serverOptions: MockFactory.createServerOptions(),
            extraMessageCount: 0,
            isLoopActive: true,
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

    it('should NOT start a new loop if already running the same meeting', async () => {
        const existingMeeting = MockFactory.createStoredMeeting({
            _id: 100,
            conversation: [{ id: 'msg1', type: 'message', text: 'hi', speaker: 'water' }],
            audio: ['msg1']
        });

        mockMeetingsCollection.findOne.mockResolvedValue(existingMeeting);

        await handler.handleReconnection({ meetingId: '100' });

        expect(mockContext.startLoop).toHaveBeenCalled();
        expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(existingMeeting.conversation);
    });

    it('should start a new loop if meeting ID is different (switching meetings)', async () => {
        const newMeeting = MockFactory.createStoredMeeting({
            _id: 200,
            conversation: [],
            audio: []
        });

        mockMeetingsCollection.findOne.mockResolvedValue(newMeeting);

        await handler.handleReconnection({ meetingId: '200' });

        expect(mockContext.meeting._id).toBe(200);
        expect(mockContext.startLoop).toHaveBeenCalled();
    });

    it('should start a new loop if current loop is NOT running', async () => {
        mockContext.isLoopActive = false;
        const existingMeeting = MockFactory.createStoredMeeting({
            _id: 100,
            conversation: [],
            audio: []
        });
        mockMeetingsCollection.findOne.mockResolvedValue(existingMeeting);

        await handler.handleReconnection({ meetingId: '100' });

        expect(mockContext.startLoop).toHaveBeenCalled();
    });
});
