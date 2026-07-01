import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    clearLiveSessionRegistryForTests,
    socketHoldsLiveSession,
    tryAcquireLiveSession,
} from '@logic/liveSessionRegistry.js';

const {
    mockInitializeStart,
    mockInitializeReconnect,
    mockDestroy,
    MockMeetingManager,
} = vi.hoisted(() => {
    const mockInitializeStart = vi.fn().mockResolvedValue(undefined);
    const mockInitializeReconnect = vi.fn().mockResolvedValue(true);
    const mockDestroy = vi.fn().mockResolvedValue(undefined);
    class MockMeetingManager {
        meeting = { _id: 1098 };
        destroy = mockDestroy;
        initializeStart = mockInitializeStart;
        initializeReconnect = mockInitializeReconnect;
        syncClient = vi.fn();
    }
    return { mockInitializeStart, mockInitializeReconnect, mockDestroy, MockMeetingManager };
});

vi.mock('@logic/MeetingManager.js', () => ({
    MeetingManager: MockMeetingManager,
}));

vi.mock('@utils/Logger.js', () => ({
    Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { SocketManager } from '@logic/SocketManager.js';

function createMockSocket(id) {
    const sockets = new Map();
    const nsp = {
        sockets: {
            get: (socketId) => sockets.get(socketId),
        },
    };
    const socket = {
        id,
        nsp,
        on: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
    };
    sockets.set(id, socket);
    return { socket, sockets };
}

describe('SocketManager (attempt_reconnection race)', () => {
    let staleHandlers;
    let newHandlers;

    beforeEach(() => {
        clearLiveSessionRegistryForTests();
        SocketManager.clearForTests();
        mockInitializeReconnect.mockClear();
        mockInitializeStart.mockClear();
        mockDestroy.mockClear();
        staleHandlers = {};
        newHandlers = {};
    });

    it('preempts a stale live session held by the previous socket id', async () => {
        const { socket: staleSocket } = createMockSocket('old-socket');
        staleSocket.on.mockImplementation((event, cb) => {
            staleHandlers[event] = cb;
        });
        new SocketManager(staleSocket, 'test');
        await staleHandlers.start_conversation({
            meetingId: 1098,
            liveKey: 'live-key',
        });

        const { socket: newSocket } = createMockSocket('new-socket');
        newSocket.on.mockImplementation((event, cb) => {
            newHandlers[event] = cb;
        });
        new SocketManager(newSocket, 'test');

        await newHandlers.attempt_reconnection({
            meetingId: 1098,
            liveKey: 'live-key',
            handRaised: false,
        });

        expect(mockDestroy).toHaveBeenCalled();
        expect(mockInitializeReconnect).toHaveBeenCalled();
        expect(socketHoldsLiveSession(1098, 'new-socket')).toBe(true);
        expect(newSocket.emit).not.toHaveBeenCalledWith(
            'conversation_error',
            expect.objectContaining({ code: 409 }),
        );
    });

    it('still rejects attempt_reconnection when another client holds the meeting', async () => {
        tryAcquireLiveSession(1098, 'other-tab', 'different-key');

        const { socket: newSocket } = createMockSocket('new-socket');
        newSocket.on.mockImplementation((event, cb) => {
            newHandlers[event] = cb;
        });
        new SocketManager(newSocket, 'test');

        await newHandlers.attempt_reconnection({
            meetingId: 1098,
            liveKey: 'live-key',
            handRaised: false,
        });

        expect(mockInitializeReconnect).not.toHaveBeenCalled();
        expect(newSocket.emit).toHaveBeenCalledWith(
            'conversation_error',
            expect.objectContaining({ code: 409 }),
        );
    });
});
