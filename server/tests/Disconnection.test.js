
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.js';
import { createTestManager } from './commonSetup.js';

describe('MeetingManager - Disconnection Cleanup', () => {
    let context;
    let manager;

    beforeEach(async () => {
        const result = createTestManager('test');
        manager = result.manager;
        context = result;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should stop the run loop on disconnect', async () => {
        // 1. Start with run = true
        manager.run = true;

        // 2. Trigger Disconnect
        // Note: createTestManager uses a simple EventEmitter mock for socket.
        // We ensure setupListeners was called (it is in constructor).
        context.mockSocket.trigger('disconnect');

        // 3. Verify clean exit
        expect(manager.run).toBe(false);
    });

    it('should not process further events after disconnect', async () => {
        manager.run = false; // Simulate already disconnected

        // Attempt to trigger an event that would usually run logic
        // For example, handleStartConversation resets state.
        // But the critical part is the loop. 
        // If run is false, runLoop returns immediately.

        const loopSpy = vi.spyOn(manager, 'processTurn');
        await manager.runLoop();
        expect(loopSpy).not.toHaveBeenCalled();
    });
});
