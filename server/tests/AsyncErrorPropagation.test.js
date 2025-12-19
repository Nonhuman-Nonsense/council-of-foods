
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.ts';

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

describe('Async Error Propagation (Comprehensive)', () => {
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

    const testCases = [
        {
            event: 'submit_human_message',
            mockTarget: 'humanInputHandler',
            method: 'handleSubmitHumanMessage',
            payload: { text: 'Hello', speaker: 'User' }
        },
        {
            event: 'submit_human_panelist',
            mockTarget: 'humanInputHandler',
            method: 'handleSubmitHumanPanelist',
            payload: { text: 'Answer', speaker: 'Expert' }
        },
        {
            event: 'submit_injection',
            mockTarget: 'humanInputHandler',
            method: 'handleSubmitInjection',
            payload: { text: 'Event', date: '2023-10-27', index: 0, length: 1 }
        },
        {
            event: 'raise_hand',
            mockTarget: 'handRaisingHandler',
            method: 'handleRaiseHand',
            payload: { index: 0, humanName: 'Tester' }
        },
        {
            event: 'wrap_up_meeting',
            mockTarget: 'meetingLifecycleHandler',
            method: 'handleWrapUpMeeting',
            payload: { date: '2023-10-27' }
        },
        {
            event: 'attempt_reconnection',
            mockTarget: 'connectionHandler',
            method: 'handleReconnection',
            payload: { meetingId: 123, clientKey: 'key' }
        },
        {
            event: 'start_conversation',
            mockTarget: 'meetingLifecycleHandler',
            method: 'handleStartConversation',
            payload: { topic: 'Test', language: 'en', characters: [] }
        },
        {
            event: 'disconnect',
            mockTarget: 'connectionHandler',
            method: 'handleDisconnect',
            payload: null
        },
        {
            event: 'continue_conversation',
            mockTarget: 'meetingLifecycleHandler',
            method: 'handleContinueConversation',
            payload: null
        },
        {
            event: 'request_clientkey',
            mockTarget: 'meetingLifecycleHandler',
            method: 'handleRequestClientKey',
            payload: null
        }
    ];

    testCases.forEach(({ event, mockTarget, method, payload }) => {
        it(`should catch errors in '${event}' and broadcast 500`, async () => {
            const error = new Error(`Simulated Crash in ${method}`);

            // Sabotage the handler
            manager[mockTarget][method].mockRejectedValue(error);

            const handler = socketHandlers[event];
            expect(handler, `Handler for ${event} not found`).toBeDefined();

            // Execute
            await handler(payload);

            // Assert
            expect(manager[mockTarget][method]).toHaveBeenCalled();
            expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
                message: "Internal Server Error",
                code: 500
            }));
        });
    });

    // Validates that prototype listeners also behave correctly
    it('should verify prototype listeners if environment is prototype', async () => {
        // Re-init with prototype environment
        manager = new MeetingManager(mockSocket, 'prototype', null, mockServices);

        const protoEvents = ['pause_conversation', 'resume_conversation', 'remove_last_message'];

        // We can't easily mock the inline arrow functions in setupPrototypeListeners without refactoring,
        // but we can verify they don't crash the *test* (which would happen if they threw unhandled).
        // For strict error bubbling on these, we'd need to mock the logic *inside* them (Logger, etc.) or refactor them to delegates.
        // Given we just want to ensure they are async safe, calling them is a good start.

        // Let's force throw inside Logger.info (which they all use) to simulate an error
        const loggerError = new Error("Logger Crash");
        const Logger = await import('@utils/Logger.js');
        Logger.Logger.info.mockImplementation(() => { throw loggerError; });

        for (const event of protoEvents) {
            const handler = socketHandlers[event];
            expect(handler, `Handler for ${event} not found`).toBeDefined();

            await handler();

            expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
                message: "Internal Server Error",
                code: 500
            }));
            // Clear for next loop
            mockSocket.emit.mockClear();
        }
    });

});
