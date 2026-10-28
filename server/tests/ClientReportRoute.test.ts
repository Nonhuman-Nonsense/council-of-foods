import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Express } from 'express';
import { ClientReportBody, buildClientErrorReport, registerClientReportRoutes } from '@api/clientReportRoutes.js';
import { sendReport } from '@utils/errorbot.js';
import { OWN_CLIENT_HEADER, OWN_CLIENT_VALUE } from '@shared/ownClient.js';

const fetchMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@root/src/config.js', () => ({
    config: {
        COUNCIL_ERRORBOT: 'http://localhost:4000/ingest',
        COUNCIL_ERRORBOT_KEY: 'test-key',
        COUNCIL_DB_PREFIX: 'council-test',
    },
}));

describe('ClientReportBody schema', () => {
    it('accepts a minimal valid body', () => {
        const result = ClientReportBody.safeParse({ message: 'boom', source: 'window.onerror' });
        expect(result.success).toBe(true);
    });

    it('accepts optional severity/clientImpact', () => {
        const result = ClientReportBody.safeParse({
            message: 'boom',
            source: 'window.onerror',
            severity: 'warning',
            clientImpact: 'none',
        });
        expect(result.success).toBe(true);
    });

    it('rejects an unknown severity value', () => {
        const result = ClientReportBody.safeParse({
            message: 'boom',
            source: 'window.onerror',
            severity: 'catastrophic',
        });
        expect(result.success).toBe(false);
    });

    it('accepts a body from an older client without interaction signals', () => {
        const result = ClientReportBody.safeParse({ message: 'boom', source: 'window.onerror', url: 'http://x/' });
        expect(result.success).toBe(true);
    });

    it('rejects a missing message', () => {
        const result = ClientReportBody.safeParse({ source: 'window.onerror' });
        expect(result.success).toBe(false);
    });
});

describe('buildClientErrorReport', () => {
    it('defaults to critical/terminal when severity/clientImpact are omitted', () => {
        const report = buildClientErrorReport({ message: 'boom', source: 'react-error-boundary' });
        expect(report.severity).toBe('critical');
        expect(report.clientImpact).toBe('terminal');
    });

    it('honors an explicit lower severity/impact', () => {
        const report = buildClientErrorReport({
            message: 'boom',
            source: 'window.onerror',
            severity: 'warning',
            clientImpact: 'none',
        });
        expect(report.severity).toBe('warning');
        expect(report.clientImpact).toBe('none');
    });

    it('always includes source in context, even when a meetingId is present', () => {
        expect(buildClientErrorReport({ message: 'boom', source: 'window.onerror' }).context).toBe(
            'client window.onerror',
        );
        expect(
            buildClientErrorReport({ message: 'boom', source: 'Council.loadMeeting', meetingId: 42 }).context,
        ).toBe('client Council.loadMeeting');
    });

    it('appends the url to the message when present', () => {
        const report = buildClientErrorReport({
            message: 'boom',
            source: 'window.onerror',
            url: 'http://council-of-foods.com/meeting/42',
        });
        expect(report.message.split('\n')[0]).toBe('[CLIENT TERMINAL] boom (http://council-of-foods.com/meeting/42)');
    });

    it.each([
        { name: 'visitor who interacted', interacted: true, webdriver: false, present: [], absent: ['[no-interaction]', '[webdriver]'] },
        { name: 'crawler that never interacted', interacted: false, webdriver: false, present: ['[no-interaction]'], absent: ['[webdriver]'] },
        { name: 'headless browser', interacted: true, webdriver: true, present: ['[webdriver]'], absent: ['[no-interaction]'] },
        { name: 'older client without signals', interacted: undefined, webdriver: undefined, present: [], absent: ['[no-interaction]', '[webdriver]'] },
    ])('tags the client line for a $name', ({ interacted, webdriver, present, absent }) => {
        const report = buildClientErrorReport(
            { message: 'boom', source: 'window.onerror', interacted, webdriver },
            'Mozilla/5.0 (compatible; Googlebot/2.1)',
        );
        const clientLine = report.message.split('\n')[1];
        expect(clientLine).toContain('UA: Mozilla/5.0 (compatible; Googlebot/2.1)');
        for (const tag of present) expect(clientLine).toContain(tag);
        for (const tag of absent) expect(clientLine).not.toContain(tag);
    });

    it('truncates a very long user agent', () => {
        const report = buildClientErrorReport({ message: 'boom', source: 'window.onerror' }, 'A'.repeat(1000));
        expect(report.message).not.toContain('A'.repeat(201));
        expect(report.message).toContain('A'.repeat(200));
    });
});

describe('client-report → errorbot relay', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockClear();
    });

    it('posts the built report to the errorbot', async () => {
        await sendReport(
            buildClientErrorReport({
                message: 'undefined is not an object',
                source: 'window.onerror',
                severity: 'warning',
                clientImpact: 'none',
            }),
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:4000/ingest');

        const body = JSON.parse(init.body);
        expect(body.severity).toBe('warning');
        expect(body.clientImpact).toBe('none');
        // A recoverable report must not read as a dead client at a glance.
        expect(body.message).toContain('[CLIENT]');
        expect(body.message).not.toContain('[CLIENT TERMINAL]');
    });
});

/**
 * The route relays straight into the team's alert chat, so only our own client may
 * use it — not a scanner or anyone else posting JSON at it.
 */
describe('POST /api/client-report', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockClear();
    });

    async function post(headers: Record<string, string>) {
        let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
        registerClientReportRoutes({ post: (_path: string, h: typeof handler) => { handler = h; } } as unknown as Express);
        const res = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, json() { return this; }, end() { return this; } };
        await handler!({ headers, body: { message: 'boom', source: 'window.onerror' }, get: () => undefined }, res);
        return res.statusCode;
    }

    it.each([
        { name: 'relays a report from our own client', headers: { [OWN_CLIENT_HEADER.toLowerCase()]: OWN_CLIENT_VALUE }, status: 204, relayed: true },
        { name: 'refuses a report from anyone else', headers: {}, status: 403, relayed: false },
    ])('$name', async ({ headers, status, relayed }) => {
        expect(await post(headers)).toBe(status);
        expect(fetchMock).toHaveBeenCalledTimes(relayed ? 1 : 0);
    });
});
