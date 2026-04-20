import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { registerAudioRoutes } from '@api/audioRoutes.js';
import { audioCollection } from '@services/DbService.js';

describe('HTTP GET /api/audio/:audioId (integration)', () => {
    let httpServer;
    let port;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerAudioRoutes(app);
        httpServer = http.createServer(app);
        port = await new Promise((resolve, reject) => {
            httpServer.listen(0, '127.0.0.1', () => {
                const addr = httpServer.address();
                if (addr && typeof addr !== 'string') resolve(addr.port);
                else reject(new Error('no port'));
            });
            httpServer.on('error', reject);
        });
    });

    afterAll(
        async () =>
            new Promise((resolve) => {
                httpServer?.close(() => resolve());
            })
    );

    const base = () => `http://127.0.0.1:${port}`;

    it('returns 200, JSON, Cache-Control, ETag, and round-trips base64 audio', async () => {
        const id = 'clip-integration-1';
        const bytes = Buffer.from('not-a-real-codec-but-bytes');
        await audioCollection.insertOne({
            _id: id,
            date: new Date().toISOString(),
            meeting_id: 42,
            audio: bytes,
            sentences: [{ text: 'hi', start: 0, end: 1 }],
        });

        const res = await fetch(`${base()}/api/audio/${encodeURIComponent(id)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('public');
        expect(res.headers.get('cache-control')).toContain('immutable');
        const etag = res.headers.get('etag');
        expect(etag).toBeTruthy();

        const body = await res.json();
        expect(body.id).toBe(id);
        expect(body.sentences).toEqual([{ text: 'hi', start: 0, end: 1 }]);
        expect(typeof body.audioBase64).toBe('string');
        expect(Buffer.from(body.audioBase64, 'base64').equals(bytes)).toBe(true);

        const res304 = await fetch(`${base()}/api/audio/${encodeURIComponent(id)}`, {
            headers: { 'If-None-Match': etag },
        });
        expect(res304.status).toBe(304);
    });

    it('returns 404 when clip is missing', async () => {
        const res = await fetch(`${base()}/api/audio/${encodeURIComponent('missing-id-xyz')}`);
        expect(res.status).toBe(404);
    });

    it('returns 400 for invalid audio id', async () => {
        const res = await fetch(`${base()}/api/audio/${encodeURIComponent('../etc/passwd')}`);
        expect(res.status).toBe(400);
    });
});
