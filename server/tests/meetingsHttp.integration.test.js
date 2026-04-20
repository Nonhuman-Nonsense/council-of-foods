import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { meetingsCollection } from '@services/DbService.js';

function validCreateBody() {
    return {
        topic: { id: 't-int', title: 'Integration Topic', description: 'D', prompt: 'Prompt' },
        characters: [
            {
                id: 'water',
                name: 'Water',
                type: 'food',
                voice: 'alloy',
            },
        ],
        language: 'en',
    };
}

describe('HTTP meetings API (integration)', () => {
    let httpServer;
    let port;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerMeetingRoutes(app, 'test');
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

    it('POST /api/meetings creates a meeting and returns id + liveKey', async () => {
        const res = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.meetingId).toBeDefined();
        expect(data.liveKey).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('POST /api/meetings returns 400 on invalid payload', async () => {
        const res = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    it('GET /api/meetings/:id returns 400 on invalid meeting id', async () => {
        const res = await fetch(`${base()}/api/meetings/invalid-id`);
        expect(res.status).toBe(400);
    });

    it('GET /api/meetings/:id without Authorization returns 200 replay manifest without liveKey', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId, liveKey } = await createRes.json();

        await meetingsCollection.updateOne(
            { _id: Number(meetingId) },
            {
                $set: {
                    conversation: [
                        { id: 'pub-m1', type: 'message', speaker: 'water', text: 'Hello' },
                        { id: 'sum1', type: 'summary', speaker: 'water', text: 'Summary' },
                    ],
                    audio: ['pub-m1', 'sum1'],
                    summary: { id: 'sum1', type: 'summary', speaker: 'water', text: 'Summary' },
                    maximumPlayedIndex: 1,
                },
            }
        );

        const res = await fetch(`${base()}/api/meetings/${meetingId}`);
        expect(res.status).toBe(200);
        const meeting = await res.json();
        expect(meeting.liveKey).toBeUndefined();
        expect(meeting._id).toBe(Number(meetingId));
        expect(meeting.conversation).toHaveLength(2);
        expect(meeting.conversation[0].id).toBe('pub-m1');
        expect(meeting.audio).toEqual(['pub-m1', 'sum1']);

        const authRes = await fetch(`${base()}/api/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${liveKey}` },
        });
        expect(authRes.status).toBe(200);
        const full = await authRes.json();
        expect(full.conversation).toEqual(meeting.conversation);
        expect(full.liveKey).toBeUndefined();
    });

    it('GET /api/meetings/:id returns 403 when Bearer does not match liveKey', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId } = await createRes.json();

        const res = await fetch(`${base()}/api/meetings/${meetingId}`, {
            headers: { Authorization: 'Bearer wrong-key' },
        });
        expect(res.status).toBe(403);
    });

    it('GET /api/meetings/:id returns 404 for unknown id (public or Bearer)', async () => {
        const resPublic = await fetch(`${base()}/api/meetings/999999999`);
        expect(resPublic.status).toBe(404);

        const resAuth = await fetch(`${base()}/api/meetings/999999999`, {
            headers: { Authorization: 'Bearer any' },
        });
        expect(resAuth.status).toBe(404);
    });

    it('GET /api/meetings/:id returns 200 and meeting when Bearer matches liveKey', async () => {
        const body = validCreateBody();
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const { meetingId, liveKey } = await createRes.json();

        const res = await fetch(`${base()}/api/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${liveKey}` },
        });
        expect(res.status).toBe(200);
        const meeting = await res.json();
        expect(meeting._id).toBe(Number(meetingId));
        expect(meeting.topic.title).toBe(body.topic.title);
        expect(meeting.liveKey).toBeUndefined();
    });
});
