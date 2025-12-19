
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.ts';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

vi.mock('@utils/errorbot.js', () => ({
    reportError: vi.fn(),
    reportWarning: vi.fn()
}));

vi.mock('@logic/AudioSystem.js');
vi.mock('@logic/DialogGenerator.js');
vi.mock('@logic/HumanInputHandler.js');
vi.mock('@logic/HandRaisingHandler.js');
vi.mock('@logic/MeetingLifecycleHandler.js');
vi.mock('@logic/ConnectionHandler.js');
vi.mock('@logic/GlobalOptions.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getGlobalOptions: () => ({ audioConcurrency: 1 })
    };
});

describe('MeetingManager Error Handling', () => {
    let mockSocket;
    let manager;
    let mockServices;
    let socketHandlers = {};

    beforeEach(() => {
        socketHandlers = {};
        mockSocket = {
            on: vi.fn((event, cb) => {
                socketHandlers[event] = cb;
            }),
            emit: vi.fn(),
            id: 'mock-socket'
        };

        mockServices = {
            meetingsCollection: { updateOne: vi.fn() },
            audioCollection: {},
            insertMeeting: vi.fn(),
            getOpenAI: vi.fn()
        };

        manager = new MeetingManager(mockSocket, 'test', null, mockServices);
    });

    it('should catch error in start_conversation handler and broadcast error', async () => {
        const error = new Error("Simulated Failure");
        // Mock handler to throw
        manager.meetingLifecycleHandler.handleStartConversation.mockRejectedValue(error);

        const validPayload = {
            topic: "Test",
            language: "en",
            characters: []
        };

        const handler = socketHandlers['start_conversation'];
        expect(handler).toBeDefined();

        await handler(validPayload);

        expect(manager.meetingLifecycleHandler.handleStartConversation).toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
            message: "Internal Server Error",
            code: 500
        }));
    });

    it('should catch error in wrap_up_meeting handler and broadcast error', async () => {
        const error = new Error("Wrap Up Failure");
        manager.meetingLifecycleHandler.handleWrapUpMeeting.mockRejectedValue(error);

        const validPayload = { date: "2023-10-27" };

        const handler = socketHandlers['wrap_up_meeting'];
        expect(handler).toBeDefined();

        await handler(validPayload);

        expect(manager.meetingLifecycleHandler.handleWrapUpMeeting).toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
            message: "Internal Server Error",
            code: 500
        }));
    });

    it('should catch error in synchronous disconnect handler and broadcast error', async () => {
        const error = new Error("Disconnect Failure");
        // Mock to throw synchronously
        manager.connectionHandler.handleDisconnect.mockImplementation(() => {
            throw error;
        });

        const handler = socketHandlers['disconnect'];
        expect(handler).toBeDefined();

        await handler();

        expect(manager.connectionHandler.handleDisconnect).toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
            message: "Internal Server Error",
            code: 500
        }));
    });
});
