import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@utils/Logger.js';

describe('Logger.staleEvent', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Spy so the real info/warn bodies (console + ErrorBot report) don't run.
        infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});
        warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(async () => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs at info (no ErrorBot) when within the reconnect grace window', () => {
        Logger.staleEvent('meeting 1', 'extend_meeting', 'no sentinel', {
            lastReconnectionAt: Date.now(),
        });

        expect(warnSpy).not.toHaveBeenCalled();
        expect(infoSpy).toHaveBeenCalledWith(
            'meeting 1',
            expect.stringContaining('Expected stale extend_meeting after reconnect'),
        );
    });

    it('logs at warn (desync) when reconnect was long ago', () => {
        Logger.staleEvent('meeting 1', 'extend_meeting', 'no sentinel', {
            lastReconnectionAt: Date.now() - 60_000,
        });

        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            'meeting 1',
            expect.stringContaining('Unexpected desync, dropped extend_meeting'),
            expect.any(Object),
        );
    });

    it('logs at warn when there was never a reconnect (lastReconnectionAt undefined)', () => {
        Logger.staleEvent('meeting 1', 'submit_human_message', 'not awaiting', {
            from: { getReportContext: () => ({ meetingId: 1 }) },
        });

        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not forward lastReconnectionAt into the warn details', () => {
        Logger.staleEvent('meeting 1', 'skip_human_turn', 'not awaiting', {
            lastReconnectionAt: Date.now() - 60_000,
            from: { getReportContext: () => ({ meetingId: 1 }) },
        });

        const details = warnSpy.mock.calls[0][2] as Record<string, unknown>;
        expect(details).not.toHaveProperty('lastReconnectionAt');
        expect(details).toHaveProperty('from');
    });
});
