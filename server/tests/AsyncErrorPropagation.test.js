
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocketManager } from '@logic/SocketManager.js';
import { MeetingManager } from '@logic/MeetingManager.js';
import { ZodError } from 'zod';

import { Logger } from '@utils/Logger.js';

// Mock dependencies
vi.mock('@utils/Logger.js', () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

// Mock logic modules

// Mock logic modules
// We need to return mock instances so we can control their methods
const mockHumanInputHandler = { handleSubmitHumanMessage: vi.fn(), handleSubmitHumanPanelist: vi.fn(), handleSubmitInjection: vi.fn() };
const mockHandRaisingHandler = { handleRaiseHand: vi.fn() };
const mockMeetingLifecycleHandler = {
    handleWrapUpMeeting: vi.fn(),
    handleStartConversation: vi.fn(),
    handleContinueConversation: vi.fn(),
    handleRequestClientKey: vi.fn(),
    handlePauseConversation: vi.fn(),
    handleResumeConversation: vi.fn(),
    handleRemoveLastMessage: vi.fn()
};
const mockConnectionHandler = { handleReconnection: vi.fn(), handleDisconnect: vi.fn() };
const mockAudioSystem = { queueAudioGeneration: vi.fn() };
const mockDialogGenerator = {};

// Fix mocks to handle Class construction
vi.mock('@logic/HumanInputHandler.js', () => ({
    HumanInputHandler: class { constructor() { return mockHumanInputHandler; } }
}));
vi.mock('@logic/HandRaisingHandler.js', () => ({
    HandRaisingHandler: class { constructor() { return mockHandRaisingHandler; } }
}));
vi.mock('@logic/MeetingLifecycleHandler.js', () => ({
    MeetingLifecycleHandler: class { constructor() { return mockMeetingLifecycleHandler; } }
}));
vi.mock('@logic/ConnectionHandler.js', () => ({
    ConnectionHandler: class { constructor() { return mockConnectionHandler; } }
}));
// AudioSystem needs to be a class that returns the mock instance
vi.mock('@logic/AudioSystem.js', () => ({
    AudioSystem: class { constructor() { return mockAudioSystem; } }
}));
vi.mock('@logic/DialogGenerator.js', () => ({
    DialogGenerator: class { constructor() { return mockDialogGenerator; } }
}));

vi.mock('@logic/GlobalOptions.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getGlobalOptions: () => ({ audioConcurrency: 1 })
    };
});

// We need to mock MeetingManager so we can spy on it?
// Actually, SocketManager creates it. If we use the real MeetingManager, it uses the mocked handlers above.
// That's perfect.

describe('Async Error Propagation (Comprehensive)', () => {
    let mockSocket;
    let socketManager;
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

        // Reset mocks
        vi.clearAllMocks();

        socketManager = new SocketManager(mockSocket, 'test');
    });

    const testCases = [
        {
            event: 'submit_human_message',
            mockObj: mockHumanInputHandler,
            method: 'handleSubmitHumanMessage',
            payload: { text: 'Hello', speaker: 'User' }
        },
        {
            event: 'submit_human_panelist',
            mockObj: mockHumanInputHandler,
            method: 'handleSubmitHumanPanelist',
            payload: { text: 'Answer', speaker: 'Expert' }
        },
        {
            event: 'submit_injection',
            mockObj: mockHumanInputHandler,
            method: 'handleSubmitInjection',
            payload: { text: 'Event', date: '2023-10-27', index: 0, length: 1 }
        },
        {
            event: 'raise_hand',
            mockObj: mockHandRaisingHandler,
            method: 'handleRaiseHand',
            payload: { index: 0, humanName: 'Tester' }
        },
        {
            event: 'wrap_up_meeting',
            mockObj: mockMeetingLifecycleHandler,
            method: 'handleWrapUpMeeting',
            payload: { date: '2023-10-27' }
        },
        {
            event: 'attempt_reconnection',
            mockObj: mockConnectionHandler,
            method: 'handleReconnection',
            payload: { meetingId: 123, clientKey: 'key' }
        },
        {
            event: 'start_conversation',
            mockObj: mockMeetingLifecycleHandler,
            method: 'handleStartConversation',
            payload: { topic: 'Test', language: 'en', characters: [] }
        },
        // Disconnect is handled by SocketManager directly calling destroySession.
        // It's not async awaited in a way that catches errors easily?
        // And it doesn't emit 500 (pointless since disconnected).
        // Skipping disconnect test for 500 broadcast.

        {
            event: 'continue_conversation',
            mockObj: mockMeetingLifecycleHandler,
            method: 'handleContinueConversation',
            payload: null
        },
        {
            event: 'request_clientkey',
            mockObj: mockMeetingLifecycleHandler,
            method: 'handleRequestClientKey',
            payload: null
        }
    ];

    testCases.forEach(({ event, mockObj, method, payload }) => {
        // Disconnect doesn't broadcast error, so skip
        if (event === 'disconnect') return;

        it(`should catch errors in '${event}' and broadcast 500`, async () => {
            const error = new Error(`Simulated Crash in ${method}`);
            const handler = socketHandlers[event];
            expect(handler, `Handler for ${event} not found`).toBeDefined();

            // Setup: We need an active session for Proxy events
            // Lifecycle events (start/reconnect) don't need active session
            const isLifecycle = ['start_conversation', 'attempt_reconnection'].includes(event);

            if (!isLifecycle) {
                // Initialize a session first
                // We trust start_conversation logic works, but we can just fake it by populating currentSession
                // Since currentSession is private, we'll trigger start_conversation
                const startHandler = socketHandlers['start_conversation'];
                mockMeetingLifecycleHandler.handleStartConversation.mockResolvedValueOnce(); // succeed
                await startHandler({ topic: 'Setup', language: 'en', characters: [] });
            }

            // Sabotage
            mockObj[method].mockRejectedValue(error);

            // Execute
            try {
                await handler(payload);
            } catch (e) {
                // Should use try/catch in socket manager
            }

            // Assert
            if (isLifecycle) {
                // For lifecycle, we need to ensure SocketManager wraps them in try/catch.
                // Currently I know they are NOT wrapped.
                // So this test WLLL FAIL until I fix SocketManager.
            }

            // Note: For Proxy events, I added try/catch in previous step.

            expect(mockObj[method]).toHaveBeenCalled();
            expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
                message: "Internal Server Error",
                code: 500
            }));

            expect(Logger.error).toHaveBeenCalledTimes(1);
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/^(meeting \d+|socket mock-socket)$/),
                expect.stringContaining(`Error handling event ${event}`),
                expect.any(Error)
            );
            Logger.error.mockClear();
        });
    });

    // Prototype listeners
    it('should verify prototype listeners if environment is prototype', async () => {
        // Re-init with prototype environment
        socketManager = new SocketManager(mockSocket, 'prototype');
        // Initialize session
        const startHandler = socketHandlers['start_conversation'];
        mockMeetingLifecycleHandler.handleStartConversation.mockResolvedValueOnce();
        await startHandler({ topic: 'Setup', language: 'en', characters: [] });


        const protoTestCases = [
            { event: 'pause_conversation', method: 'handlePauseConversation' },
            { event: 'resume_conversation', method: 'handleResumeConversation' },
            { event: 'remove_last_message', method: 'handleRemoveLastMessage' }
        ];

        for (const { event, method } of protoTestCases) {
            const error = new Error(`Simulated Crash in ${method}`);
            mockMeetingLifecycleHandler[method].mockRejectedValue(error);

            const handler = socketHandlers[event];
            expect(handler, `Handler for ${event} not found`).toBeDefined();

            await handler();

            expect(mockMeetingLifecycleHandler[method]).toHaveBeenCalled();
            expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
                message: "Internal Server Error",
                code: 500
            }));

            expect(Logger.error).toHaveBeenCalledTimes(1);
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringMatching(/^(meeting \d+|socket mock-socket)$/),
                expect.stringContaining(`Error handling event ${event}`),
                expect.any(Error)
            );
            Logger.error.mockClear();

            mockSocket.emit.mockClear();
        }
    });

    it('should catch Zod validation errors and broadcast 400', async () => {
        const error = new ZodError([]);
        const method = 'handleSubmitHumanMessage';
        const event = 'submit_human_message';

        // Setup session
        const startHandler = socketHandlers['start_conversation'];
        mockMeetingLifecycleHandler.handleStartConversation.mockResolvedValueOnce();
        await startHandler({ topic: 'Setup', language: 'en', characters: [] });

        // Sabotage with ZodError
        mockHumanInputHandler[method].mockRejectedValue(error);

        const handler = socketHandlers[event];
        await handler({ text: 'Invalid', speaker: 'User' });

        // Assert
        expect(mockSocket.emit).toHaveBeenCalledWith("conversation_error", expect.objectContaining({
            message: "Invalid Input",
            code: 400
        }));

        // Verify reportWarning called
        expect(Logger.error).not.toHaveBeenCalled();
        expect(Logger.warn).toHaveBeenCalledWith(
            expect.stringMatching(/^(meeting \d+|socket mock-socket)$/),
            expect.stringContaining(`Validation Error for ${event}`),
            expect.any(ZodError)
        );
    });

});
