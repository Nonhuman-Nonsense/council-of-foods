import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('Logging & Reporting System', () => {
    let Logger;
    let reportError;

    const mocks = vi.hoisted(() => ({
        config: {
            COUNCIL_ERRORBOT: 'http://mock-errorbot',
            COUNCIL_DB_PREFIX: 'TestService'
        }
    }));

    // Mock the config module
    vi.mock('@root/src/config.js', () => ({
        get config() {
            return mocks.config;
        }
    }));

    vi.mock('@root/src/config.js', () => ({
        get config() {
            return mocks.config;
        }
    }));

    let consoleLogSpy;
    let consoleWarnSpy;
    let consoleErrorSpy;

    beforeEach(async () => {
        // Clear module cache to ensure we get mocked config
        vi.resetModules();

        // Dynamically import modules
        const loggerModule = await import('@utils/Logger.js');
        Logger = loggerModule.Logger;

        const errorbotModule = await import('@utils/errorbot.js');
        reportError = errorbotModule.reportError;

        // Reset mock config for each test
        mocks.config.COUNCIL_ERRORBOT = 'http://mock-errorbot';
        mocks.config.COUNCIL_DB_PREFIX = 'TestService';

        // Spy on console methods and suppress output
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock fetch for errorbot
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('ok')
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Logger Utility', () => {
        it('should format info logs correctly with context', () => {
            Logger.info('TEST_CTX', 'info message');
            // We check matching parts because colors introduce ANSI codes
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[TEST_CTX]'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
        });

        it('should format warn logs correctly', () => {
            Logger.warn('TEST_CTX', 'warning message');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[TEST_CTX]'));
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('warning message'));
        });

        it('should format error logs correctly with simple message', () => {
            Logger.error('TEST_CTX', 'error message');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[TEST_CTX]'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('error message'));
        });

        it('should log detailed error stack when Error object provided', () => {
            const error = new Error('Test Error Object');
            Logger.error('TEST_CTX', 'failed', error);

            // Primary log
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[TEST_CTX]'));
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('failed'));

            // Stack trace or details (Logger.error makes multiple console.error calls)
            // The first call is the formatted line, second is the stack
            expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
            const calls = consoleErrorSpy.mock.calls;
            const stackLog = calls[1][0]; // 2nd call, 1st arg

            expect(stackLog).toContain('Error: Test Error Object');
            // Assuming colorette gray is used, we might expect codes, but checking message existence is key
        });

        it('should log JSON for non-Error objects', () => {
            const obj = { foo: 'bar' };
            Logger.error('TEST_CTX', 'failed', obj);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
            expect(consoleErrorSpy.mock.calls[1][0]).toContain('{\n  "foo": "bar"\n}');
        });
    });

    describe('reportError (Errorbot)', () => {
        it('should log strictly to console via Logger and attempt to send report', async () => {
            const err = new Error('Reporting fail');
            await reportError('TEST_CTX', 'Something went wrong', err);

            // Verify local logging
            expect(consoleErrorSpy).toHaveBeenCalled();
            const logCall = consoleErrorSpy.mock.calls.find(call => call[0].includes('Something went wrong'));
            expect(logCall).toBeDefined();

            // Verify network call
            expect(global.fetch).toHaveBeenCalledWith(
                'http://mock-errorbot',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"service":"TestService"')
                })
            );

            // Verify payload structure in fetch body
            const fetchCall = global.fetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body).toMatchObject({
                context: 'TEST_CTX',
                message: 'Something went wrong',
                level: 'ERROR',
                error: expect.objectContaining({
                    message: 'Reporting fail',
                    name: 'Error'
                })
            });
        });

        it('should handle missing error object gracefully', async () => {
            await reportError('TEST_CTX', 'Just a message');

            const fetchCall = global.fetch.mock.calls[0];
            const body = JSON.parse(fetchCall[1].body);
            expect(body).toMatchObject({
                context: 'TEST_CTX',
                message: 'Just a message',
            });
            expect(body).not.toHaveProperty('error');
        });

        it('should not throw if fetch fails', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));

            // Should not throw
            await expect(reportError('CTX', 'Msg')).resolves.not.toThrow();

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to post to errorbot:'));
        });
    });
});
