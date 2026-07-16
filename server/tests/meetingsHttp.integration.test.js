import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { meetingsCollection } from '@services/DbService.js';
import { cacheControlPrivateNoStoreApi } from '@utils/httpCache.js';
import { Logger } from '@utils/Logger.js';

function validCreateBody() {
    return {
        topic: { id: 't-int', title: 'Integration Topic', description: 'D', prompt: 'Prompt' },
        characters: [
            {
                id: 'speaker1',
                name: 'Speaker 1',
                description: 'Generic integration-test speaker.',
                prompt: 'Speak as Speaker 1 in the council.',
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
        app.use('/api', cacheControlPrivateNoStoreApi);
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

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const base = () => `http://127.0.0.1:${port}`;

    it('POST /api/meetings creates a meeting and returns id + liveKey', async () => {
        const res = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        expect(res.status).toBe(201);
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        const data = await res.json();
        expect(data.meetingId).toBeDefined();
        expect(data.liveKey).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('POST /api/meetings stores optional humanName on meeting state', async () => {
        const res = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validCreateBody(), humanName: 'Leo' }),
        });
        expect(res.status).toBe(201);
        const { meetingId, liveKey } = await res.json();

        const getRes = await fetch(`${base()}/api/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${liveKey}` },
        });
        expect(getRes.status).toBe(200);
        const meeting = await getRes.json();
        expect(meeting.state.humanName).toBe('Leo');
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
        const warnSpy = vi.spyOn(Logger, 'warn');
        const res = await fetch(`${base()}/api/meetings/invalid-id`);
        expect(res.status).toBe(400);

        // The failure log should show the real URL and raw param, not just the route pattern —
        // this is what lets you trace which request actually failed (see meetingRoutes.ts).
        expect(warnSpy).toHaveBeenCalledWith(
            'api',
            expect.stringContaining('/api/meetings/invalid-id'),
            expect.objectContaining({
                from: { meetingId: undefined },
                requestParams: expect.objectContaining({
                    params: { meetingId: 'invalid-id' },
                }),
            }),
        );
    });

    it('GET /api/meetings/:id on a freshly created meeting logs a warning with the meeting id', async () => {
        const warnSpy = vi.spyOn(Logger, 'warn');
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId } = await createRes.json();

        // No conversation has been generated yet (no socket session ever started), and no
        // Authorization header — the same shape as a reload/second-visit race. This used to
        // 400; it should now warn and return a meeting_incomplete manifest instead.
        const res = await fetch(`${base()}/api/meetings/${meetingId}`);
        expect(res.status).toBe(200);
        const manifest = await res.json();
        expect(manifest.conversation).toEqual([{ type: 'meeting_incomplete' }]);

        expect(warnSpy).toHaveBeenCalledWith(
            'api',
            expect.stringContaining('no playable content yet'),
            expect.objectContaining({ from: { meetingId: Number(meetingId) } }),
        );
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
                        { id: 'pub-m1', type: 'message', speaker: 'speaker1', text: 'Hello' },
                        { id: 'sum1', type: 'summary', speaker: 'speaker1', text: 'Summary' },
                    ],
                    audio: ['pub-m1', 'sum1'],
                    maximumPlayedIndex: 1,
                    meetingComplete: true,
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

    it('GET /api/autoplay returns a random completed meeting id', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId } = await createRes.json();

        await meetingsCollection.updateOne(
            { _id: Number(meetingId) },
            {
                $set: {
                    conversation: [
                        { id: 'ap-m1', type: 'message', speaker: 'speaker1', text: 'Hello' },
                        { id: 'ap-sum', type: 'summary', speaker: 'speaker1', text: 'Summary' },
                    ],
                    audio: ['ap-m1', 'ap-sum'],
                    maximumPlayedIndex: 1,
                    meetingComplete: true,
                },
            }
        );

        const res = await fetch(`${base()}/api/autoplay?language=en`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.meetingId).toBe(Number(meetingId));
    });

    it('GET /api/autoplay skips meetings whose replay manifest is incomplete', async () => {
        const incompleteRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId: incompleteId } = await incompleteRes.json();

        await meetingsCollection.updateOne(
            { _id: Number(incompleteId) },
            {
                $set: {
                    conversation: [
                        { id: 'bad-m1', type: 'message', speaker: 'speaker1', text: 'Hello' },
                        { id: 'bad-m2', type: 'message', speaker: 'speaker1', text: 'More' },
                        { id: 'bad-sum', type: 'summary', speaker: 'speaker1', text: 'Summary' },
                    ],
                    audio: ['bad-m1', 'bad-m2', 'bad-sum'],
                    maximumPlayedIndex: 0,
                    meetingComplete: false,
                },
            },
        );

        const completeRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId: completeId } = await completeRes.json();

        await meetingsCollection.updateOne(
            { _id: Number(completeId) },
            {
                $set: {
                    conversation: [
                        { id: 'ok-m1', type: 'message', speaker: 'speaker1', text: 'Hello' },
                        { id: 'ok-sum', type: 'summary', speaker: 'speaker1', text: 'Summary' },
                    ],
                    audio: ['ok-m1', 'ok-sum'],
                    maximumPlayedIndex: 1,
                    meetingComplete: true,
                },
            },
        );

        const res = await fetch(`${base()}/api/autoplay?language=en`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.meetingId).toBe(Number(completeId));
        expect(data.meetingId).not.toBe(Number(incompleteId));

        const manifestRes = await fetch(`${base()}/api/meetings/${data.meetingId}`);
        expect(manifestRes.status).toBe(200);
        const manifest = await manifestRes.json();
        expect(manifest.conversation.at(-1)?.type).toBe('summary');
    });

    it('GET /api/autoplay returns 400 on invalid language', async () => {
        const res = await fetch(`${base()}/api/autoplay?language=english`);
        expect(res.status).toBe(400);
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
