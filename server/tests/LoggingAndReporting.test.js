
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from '@utils/Logger.js';
import { CouncilError } from '@models/Errors.js';

const sendReportMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@utils/errorbot.js', () => ({
    sendReport: (...args) => sendReportMock(...args),
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
    });

    it('should broadcast 500 error if broadcaster is provided', () => {
        const mockBroadcaster = {
            broadcastError: vi.fn(),
        };

        const error = new Error("Broadcast Me");
        Logger.reportAndCrashClient("TestContext", "Client Message", error, mockBroadcaster);

        expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith(
            expect.any(CouncilError),
            "TestContext",
        );
        expect(mockBroadcaster.broadcastError.mock.calls[0][0].clientMessage).toBe("Internal Server Error");
        expect(mockBroadcaster.broadcastError.mock.calls[0][0].debugCause).toBe(error);
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should report critical terminal severity to errorbot', () => {
        const error = new Error("Broadcast Me");
        Logger.reportAndCrashClient("AudioSystem", "Error generating audio", error);

        expect(sendReportMock).toHaveBeenCalledWith({
            context: "AudioSystem",
            severity: 'critical',
            message: "[CLIENT TERMINAL] Error generating audio",
            error,
            clientImpact: 'terminal',
        });
    });

    it('should not throw if broadcaster is undefined', () => {
        const error = new Error("No Broadcaster");
        expect(() => {
            Logger.reportAndCrashClient("TestContext", "Silent failure", error);
        }).not.toThrow();

        expect(consoleSpy.error).toHaveBeenCalled();
    });
});
