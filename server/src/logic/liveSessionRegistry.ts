/**
 * Process-local registry: at most one live socket session per meeting id.
 * Cleared when that socket disconnects or is replaced (see SocketManager).
 */

const liveSessions = new Map<number, { socketId: string; creatorKey: string }>();

export function tryAcquireLiveSession(meetingId: number, socketId: string, creatorKey: string): boolean {
    const cur = liveSessions.get(meetingId);
    if (!cur) {
        liveSessions.set(meetingId, { socketId, creatorKey });
        return true;
    }
    if (cur.socketId === socketId) {
        liveSessions.set(meetingId, { socketId, creatorKey });
        return true;
    }
    return false;
}

export function releaseLiveSession(meetingId: number, socketId: string): void {
    const cur = liveSessions.get(meetingId);
    if (cur && cur.socketId === socketId) {
        liveSessions.delete(meetingId);
    }
}

export function socketHoldsLiveSession(meetingId: number, socketId: string): boolean {
    const cur = liveSessions.get(meetingId);
    return cur !== undefined && cur.socketId === socketId;
}

/** True when any socket currently holds the live lock for this meeting. */
export function hasLiveSession(meetingId: number): boolean {
    return liveSessions.has(meetingId);
}

/** Test helper — vitest clears DB between tests; registry must match. */
export function clearLiveSessionRegistryForTests(): void {
    liveSessions.clear();
}
