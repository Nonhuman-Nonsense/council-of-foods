import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClientReportBody, buildClientErrorReport } from '@api/clientReportRoutes.js';
import { sendReport } from '@utils/errorbot.js';

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

    it('uses "client" context when a meetingId is present, "client <source>" otherwise', () => {
        expect(buildClientErrorReport({ message: 'boom', source: 'window.onerror' }).context).toBe(
            'client window.onerror',
        );
        expect(
            buildClientErrorReport({ message: 'boom', source: 'window.onerror', meetingId: 42 }).context,
        ).toBe('client');
    });

    it('appends the url to the message when present', () => {
        const report = buildClientErrorReport({
            message: 'boom',
            source: 'window.onerror',
            url: 'http://council-of-foods.com/meeting/42',
        });
        expect(report.message).toBe('[CLIENT TERMINAL] boom (http://council-of-foods.com/meeting/42)');
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
        expect(body.message).toContain('[CLIENT TERMINAL]');
    });
});
