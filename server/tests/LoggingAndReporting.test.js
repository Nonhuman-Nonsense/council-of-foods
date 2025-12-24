
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@utils/Logger.js';
import * as config from '@root/src/config.js';

// Mock config to prevent actual error reporting (if errorbot attempts it)
vi.mock('@root/src/config.js', () => ({
    config: {
        error_reporting_url: 'http://localhost:0000', // Dummy
        NODE_ENV: 'test'
    }
}));

// Mock console methods to avoid noise
const consoleSpy = {
    error: vi.spyOn(console, 'error').mockImplementation(() => { }),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => { })
};

describe('Logger Reporting', () => {

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should log error to console via Logger.error', () => {
        const error = new Error("Test Error");
        Logger.reportAndCrashClient("TestContext", "An error occurred", error);

        expect(consoleSpy.error).toHaveBeenCalled();
        // The logger adds colors, so matching exact string is hard, but we know it calls console.error
    });

    it('should broadcast 500 error if broadcaster is provided', () => {
        const mockBroadcaster = {
            broadcastError: vi.fn(),
            broadcastWarning: vi.fn()
        };

        const error = new Error("Broadcast Me");
        Logger.reportAndCrashClient("TestContext", "Client Message", error, mockBroadcaster);

        expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith("Client Message", 500);
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should not throw if broadcaster is undefined', () => {
        const error = new Error("No Broadcaster");
        // Should not throw
        expect(() => {
            Logger.reportAndCrashClient("TestContext", "Silent failure", error);
        }).not.toThrow();

        expect(consoleSpy.error).toHaveBeenCalled();
    });
});
