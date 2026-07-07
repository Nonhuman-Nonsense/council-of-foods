
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
        Logger.reportAndCrashClient("TestContext", "An error occurred", { error });

        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should broadcast 500 error if broadcaster is provided', () => {
        const mockBroadcaster = {
            broadcastError: vi.fn(),
        };

        const error = new Error("Broadcast Me");
        Logger.reportAndCrashClient("TestContext", "Client Message", {
            error,
            broadcaster: mockBroadcaster,
        });

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
        Logger.reportAndCrashClient("AudioSystem", "Error generating audio", { error });

        expect(sendReportMock).toHaveBeenCalledWith({
            context: "AudioSystem",
            severity: 'critical',
            message: "[CLIENT TERMINAL] Error generating audio",
            error,
            clientImpact: 'terminal',
            meetingId: undefined,
            socketId: undefined,
        });
    });

    it('should extract meetingId and socketId from from provider', async () => {
        const error = new Error("Session error");
        await Logger.error("meeting", "Something failed", {
            error,
            from: {
                getReportContext: () => ({ meetingId: 42, socketId: "sock-1" }),
            },
        });

        expect(sendReportMock).toHaveBeenCalledWith(expect.objectContaining({
            meetingId: 42,
            socketId: "sock-1",
        }));
    });

    it('should extract meetingId and socketId from plain from object', async () => {
        await Logger.warn("client", "Client crash", {
            from: { meetingId: 7 },
        });

        expect(sendReportMock).toHaveBeenCalledWith(expect.objectContaining({
            meetingId: 7,
            socketId: undefined,
        }));
    });

    it('should not throw if broadcaster is undefined', () => {
        const error = new Error("No Broadcaster");
        expect(() => {
            Logger.reportAndCrashClient("TestContext", "Silent failure", { error });
        }).not.toThrow();

        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should log error.cause when present', async () => {
        const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        const error = Object.assign(new TypeError('fetch failed'), { cause });

        await Logger.error('AudioSystem', 'Error generating audio', { error });

        const detailCalls = consoleSpy.error.mock.calls
            .map((call) => call[0])
            .filter((line) => typeof line === 'string' && line.includes('Caused by:'));

        expect(detailCalls.length).toBeGreaterThan(0);
        expect(detailCalls.some((line) => line.includes('ECONNREFUSED'))).toBe(true);
    });

    it('should still broadcast and report when error has a cause', () => {
        const cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
        const error = Object.assign(new TypeError('fetch failed'), { cause });
        const mockBroadcaster = { broadcastError: vi.fn() };

        Logger.reportAndCrashClient('AudioSystem', 'Error generating audio', {
            error,
            broadcaster: mockBroadcaster,
        });

        expect(mockBroadcaster.broadcastError).toHaveBeenCalledWith(
            expect.any(CouncilError),
            'AudioSystem',
        );
        expect(sendReportMock).toHaveBeenCalledWith({
            context: 'AudioSystem',
            severity: 'critical',
            message: '[CLIENT TERMINAL] Error generating audio',
            error,
            clientImpact: 'terminal',
            meetingId: undefined,
            socketId: undefined,
        });
    });
});
