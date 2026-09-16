import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import { registerBridgeRoutes, _resetBridgeRateLimitsForTests } from '@api/bridgeRoutes.js';

const BRIDGE_KEY = 'bridge-key-for-tests-0123456789';

const mockConfig = vi.hoisted(() => ({
    COUNCIL_BRIDGE_KEY: 'bridge-key-for-tests-0123456789' as string | undefined,
    COUNCIL_BREVO_API_KEY: 'brevo-key' as string | undefined,
    COUNCIL_MAIL_FROM: 'Council of Foods <council@council-of-foods.com>' as string | undefined,
    COUNCIL_ERRORBOT: 'http://errorbot.test/ingest',
    COUNCIL_ERRORBOT_KEY: 'errorbot-key',
    COUNCIL_DB_PREFIX: 'council-test',
    COUNCIL_VENUES: [
        {
            id: 'example-museum',
            name: 'Example Museum',
            alertEmails: ['staff@example-museum.org', 'tech@example-museum.org'],
            timezone: 'Europe/Stockholm',
            openingHours: { days: ['wed', 'thu', 'fri', 'sat', 'sun'], from: '12:00', to: '16:00' },
        },
        {
            id: 'other-museum',
            name: 'Other Museum',
            alertEmails: ['someone@other.org'],
            timezone: 'Europe/Berlin',
            openingHours: { days: ['tue'], from: '10:00', to: '17:00' },
        },
    ] as unknown[] | undefined,
}));

vi.mock('@root/src/config.js', () => ({ config: mockConfig }));

const realFetch = globalThis.fetch;
const outbound = vi.fn();

describe('bridge endpoints', () => {
    let httpServer: http.Server;
    let base: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerBridgeRoutes(app);
        httpServer = http.createServer(app);
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
        const address = httpServer.address();
        base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(() => new Promise<void>((resolve) => httpServer.close(() => resolve())));

    beforeEach(() => {
        _resetBridgeRateLimitsForTests();
        mockConfig.COUNCIL_BRIDGE_KEY = BRIDGE_KEY;
        mockConfig.COUNCIL_BREVO_API_KEY = 'brevo-key';
        outbound.mockReset();
        outbound.mockResolvedValue(new Response('{"messageId":"1"}', { status: 201 }));
        // Requests to this test server go through; Brevo and errorbot are captured.
        vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
            String(url).startsWith(base) ? realFetch(url, init) : outbound(String(url), init),
        );
    });

    function call(path: string, { key = BRIDGE_KEY, body }: { key?: string | null; body?: unknown } = {}) {
        return fetch(`${base}${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { 'X-Bridge-Key': key } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }

    function sentTo(host: string) {
        return outbound.mock.calls
            .filter(([url]) => url.startsWith(host))
            .map(([, init]) => JSON.parse(init.body));
    }

    const paperOut = {
        venueId: 'example-museum',
        kind: 'problem',
        reason: 'media-empty',
        since: '2026-09-16T12:32:00.000Z',
        printer: 'Museum_Printer',
        waiting: 3,
        host: 'council-museum.local',
    };

    it.each([
        ['no key', null],
        ['a wrong key', 'not-the-bridge-key-0123456789'],
    ])('refuses a bridge with %s', async (_name, key) => {
        expect((await call('/api/bridge/venues', { key })).status).toBe(401);
        expect((await call('/api/bridge/printer-alerts', { key, body: paperOut })).status).toBe(401);
        expect(outbound).not.toHaveBeenCalled();
    });

    it('answers 503 when bridges are not configured on this server', async () => {
        mockConfig.COUNCIL_BRIDGE_KEY = undefined;
        expect((await call('/api/bridge/venues')).status).toBe(503);
    });

    it('lists venues with masked recipients', async () => {
        const response = await call('/api/bridge/venues');
        const { venues } = await response.json();

        expect(venues[0]).toEqual({
            id: 'example-museum',
            name: 'Example Museum',
            recipients: ['s***@example-museum.org', 't***@example-museum.org'],
            timezone: 'Europe/Stockholm',
            openingHours: { days: ['wed', 'thu', 'fri', 'sat', 'sun'], from: '12:00', to: '16:00' },
        });
        expect(JSON.stringify(venues)).not.toContain('staff@');
    });

    it("emails a printer problem to that venue's staff only, with a copy to errorbot", async () => {
        const response = await call('/api/bridge/printer-alerts', { body: paperOut });
        expect(response.status).toBe(200);

        const [email] = sentTo('https://api.brevo.com/v3/smtp/email');
        expect(email.to).toEqual([{ email: 'staff@example-museum.org' }, { email: 'tech@example-museum.org' }]);
        expect(email.sender).toEqual({ name: 'Council of Foods', email: 'council@council-of-foods.com' });
        expect(email.subject).toContain('Example Museum');
        expect(email.subject).toContain('out of paper');
        // Local time at the venue, not the server's.
        expect(email.textContent).toContain('14:32');
        expect(outbound.mock.calls.find(([url]) => url.includes('api.brevo.com'))?.[1].headers['api-key']).toBe('brevo-key');

        const [report] = sentTo('http://errorbot.test/ingest');
        expect(report).toMatchObject({ severity: 'warning', context: 'printer example-museum' });
    });

    it.each([
        ['an unknown venue', { ...paperOut, venueId: 'somewhere-else' }, 400],
        ['an unknown kind', { ...paperOut, kind: 'panic' }, 400],
        ['a malformed date', { ...paperOut, since: 'yesterday' }, 400],
    ])('rejects %s without emailing', async (_name, body, status) => {
        expect((await call('/api/bridge/printer-alerts', { body })).status).toBe(status);
        expect(sentTo('https://api.brevo.com')).toEqual([]);
    });

    it('answers 503 without Brevo configured', async () => {
        mockConfig.COUNCIL_BREVO_API_KEY = undefined;
        expect((await call('/api/bridge/printer-alerts', { body: paperOut })).status).toBe(503);
    });

    it('reports a failed send and tells the bridge, so it can retry', async () => {
        outbound.mockImplementation(async (url: string) =>
            url.includes('api.brevo.com')
                ? new Response('{"message":"unauthorized"}', { status: 401 })
                : new Response(null, { status: 200 }),
        );

        expect((await call('/api/bridge/printer-alerts', { body: paperOut })).status).toBe(502);
        expect(sentTo('http://errorbot.test/ingest').map((r) => r.severity)).toContain('error');
    });

    it('stops a runaway bridge per venue, not across venues', async () => {
        for (let i = 0; i < 12; i += 1) {
            expect((await call('/api/bridge/printer-alerts', { body: { ...paperOut, kind: 'reminder' } })).status).toBe(200);
        }
        expect((await call('/api/bridge/printer-alerts', { body: paperOut })).status).toBe(429);
        expect((await call('/api/bridge/printer-alerts', { body: { ...paperOut, venueId: 'other-museum' } })).status).toBe(200);
    });
});
