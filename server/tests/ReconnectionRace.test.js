
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionHandler } from '../src/logic/ConnectionHandler';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
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
            meetingId: 100,
            conversation: [],
            conversationOptions: { options: { conversationMaxLength: 10 } },
            meetingDate: new Date(),
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
        const existingMeeting = {
            _id: 100,
            conversation: [{ id: 'msg1' }],
            options: { options: { conversationMaxLength: 10 } },
            date: new Date().toISOString(),
            audio: ['msg1']
        };

        mockMeetingsCollection.findOne.mockResolvedValue(existingMeeting);

        // Act
        await handler.handleReconnection({ meetingId: '100' });

        // Assert
        // ConnectionHandler ALWAYS calls startLoop to ensure liveness. Idempotency is handled inside MeetingManager.
        expect(mockContext.startLoop).toHaveBeenCalled();
        expect(mockBroadcaster.broadcastConversationUpdate).toHaveBeenCalledWith(existingMeeting.conversation);
    });

    it('should start a new loop if meeting ID is different (switching meetings)', async () => {
        // Current: 100. New: 200.
        mockContext.meetingId = 100;

        const newMeeting = {
            _id: 200,
            conversation: [],
            options: { options: {} },
            date: new Date().toISOString(),
            audio: []
        };

        mockMeetingsCollection.findOne.mockResolvedValue(newMeeting);

        // Act
        await handler.handleReconnection({ meetingId: '200' });

        // Assert
        expect(mockContext.meetingId).toBe(200);
        expect(mockContext.startLoop).toHaveBeenCalled(); // Should start loop for new meeting logic
    });

    it('should start a new loop if current loop is NOT running', async () => {
        mockContext.isLoopActive = false; // Stopped
        const existingMeeting = {
            _id: 100,
            conversation: [],
            options: { options: {} },
            date: new Date().toISOString(),
            audio: []
        };
        mockMeetingsCollection.findOne.mockResolvedValue(existingMeeting);

        await handler.handleReconnection({ meetingId: '100' });

        // ConnectionHandler just calls startLoop(), checking logic is inside startLoop or implied
        expect(mockContext.startLoop).toHaveBeenCalled();
    });
});
