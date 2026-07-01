import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRetryableNetworkError, withNetworkRetry } from '@utils/NetworkUtils.js';
import { Logger } from '@utils/Logger.js';

vi.mock('@utils/Logger.js', () => ({
    Logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('isRetryableNetworkError', () => {
    it('returns true for top-level ECONNRESET', () => {
        expect(isRetryableNetworkError({ code: 'ECONNRESET' })).toBe(true);
    });

    it('returns true for fetch failed with retryable cause', () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ECONNREFUSED' },
        });
        expect(isRetryableNetworkError(error)).toBe(true);
    });

    it('returns true for fetch failed without cause', () => {
        expect(isRetryableNetworkError(new TypeError('fetch failed'))).toBe(true);
    });

    it('returns false for fetch failed with non-retryable cause', () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ERR_INVALID_ARG_VALUE' },
        });
        expect(isRetryableNetworkError(error)).toBe(false);
    });

    it('returns true for UND_ERR_CONNECT_TIMEOUT on cause', () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
        });
        expect(isRetryableNetworkError(error)).toBe(true);
    });
});

describe('withNetworkRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('retries fetch failed with ECONNREFUSED cause then succeeds', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), {
                cause: { code: 'ECONNREFUSED' },
            }))
            .mockResolvedValueOnce('ok');

        const promise = withNetworkRetry(fn, 'TestContext');
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('ok');

        expect(fn).toHaveBeenCalledTimes(2);
        expect(Logger.warn).toHaveBeenCalledWith(
            'TestContext',
            expect.stringContaining('fetch failed (cause: ECONNREFUSED)'),
        );
    });

    it('does not retry fetch failed with non-retryable cause', async () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ERR_INVALID_ARG_VALUE' },
        });
        const fn = vi.fn().mockRejectedValue(error);

        await expect(withNetworkRetry(fn, 'TestContext')).rejects.toBe(error);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('still retries top-level ECONNRESET', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce({ code: 'ECONNRESET', message: 'read ECONNRESET' })
            .mockResolvedValueOnce('ok');

        const promise = withNetworkRetry(fn, 'TestContext');
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('ok');

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('rethrows after exhausting retries', async () => {
        const error = Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ETIMEDOUT' },
        });
        const fn = vi.fn().mockRejectedValue(error);

        const promise = withNetworkRetry(fn, 'TestContext');
        const expectation = expect(promise).rejects.toBe(error);

        await vi.runAllTimersAsync();
        await expectation;

        expect(fn).toHaveBeenCalledTimes(4);
        expect(Logger.warn).toHaveBeenCalledTimes(3);
    });
});
