import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGlobalOptions } from '@logic/GlobalOptions.js';

const { mockInitializeStart, MockMeetingManager, getLastSession } = vi.hoisted(() => {
    const mockInitializeStart = vi.fn().mockResolvedValue(undefined);
    let lastSession = null;
    class MockMeetingManager {
        serverOptions;
        constructor(_socket, _environment, serverOptions) {
            this.serverOptions = serverOptions;
            lastSession = this;
        }
        initializeStart = mockInitializeStart;
        destroy = vi.fn();
    }
    return {
        mockInitializeStart,
        MockMeetingManager,
        getLastSession: () => lastSession,
    };
});

vi.mock('@logic/MeetingManager.js', () => ({
    MeetingManager: MockMeetingManager,
}));

vi.mock('@utils/Logger.js', () => ({
    Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { SocketManager } from '@logic/SocketManager.js';

describe('SocketManager (start_conversation)', () => {
    let handlers;
    let mockSocket;

    beforeEach(() => {
        handlers = {};
        mockSocket = {
            id: 'sock-test',
            on: vi.fn((event, cb) => {
                handlers[event] = cb;
            }),
            emit: vi.fn(),
        };
        mockInitializeStart.mockClear();
    });

    it('merges payload.serverOptions onto global options when environment is prototype', async () => {
        const base = getGlobalOptions();
        new SocketManager(mockSocket, 'prototype');
        await handlers.start_conversation({
            meetingId: 1,
            creatorKey: 'k',
            serverOptions: { conversationMaxLength: 999 },
        });

        expect(mockInitializeStart).toHaveBeenCalled();
        const session = getLastSession();
        expect(session).toBeDefined();
        expect(session.serverOptions.conversationMaxLength).toBe(999);
        expect(session.serverOptions.extraMessageCount).toBe(base.extraMessageCount);
    });

    it('ignores payload.serverOptions when environment is production', async () => {
        const base = getGlobalOptions();
        new SocketManager(mockSocket, 'production');
        await handlers.start_conversation({
            meetingId: 1,
            creatorKey: 'k',
            serverOptions: { conversationMaxLength: 999 },
        });

        const session = getLastSession();
        expect(session.serverOptions.conversationMaxLength).toBe(base.conversationMaxLength);
        expect(session.serverOptions.conversationMaxLength).not.toBe(999);
    });
});
