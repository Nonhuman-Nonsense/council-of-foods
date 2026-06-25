
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    listTestErrorbotScenarios,
    sendTestErrorbotReport,
    sendAllTestErrorbotReports,
} from '@api/devErrorbotRoutes.js';

const fetchMock = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@root/src/config.js', () => ({
    config: {
        COUNCIL_ERRORBOT: 'http://localhost:4000/ingest',
        COUNCIL_ERRORBOT_KEY: 'test-key',
        COUNCIL_DB_PREFIX: 'council-test',
    },
}));

describe('Errorbot test reports', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockClear();
    });

    it('lists all sample scenarios', () => {
        expect(listTestErrorbotScenarios()).toEqual([
            'warning',
            'error',
            'critical_terminal',
            'client_terminal',
            'process_exit',
        ]);
    });

    it('sendTestErrorbotReport posts structured payload to errorbot', async () => {
        await sendTestErrorbotReport('critical_terminal');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:4000/ingest');
        expect(init.headers['X-Errorbot-Key']).toBe('test-key');

        const body = JSON.parse(init.body);
        expect(body.severity).toBe('critical');
        expect(body.clientImpact).toBe('terminal');
        expect(body.message).toContain('[CLIENT TERMINAL]');
    });

    it('sendAllTestErrorbotReports sends every scenario', async () => {
        const sent = await sendAllTestErrorbotReports();
        expect(sent).toHaveLength(5);
        expect(fetchMock).toHaveBeenCalledTimes(5);
    });
});
