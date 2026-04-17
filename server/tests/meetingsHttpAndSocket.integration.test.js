import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { SocketManager } from '@logic/SocketManager.js';
import {
    clearLiveSessionRegistryForTests,
    tryAcquireLiveSession,
} from '@logic/liveSessionRegistry.js';
import { meetingsCollection } from '@services/DbService.js';

const { integrationGetOpenAI } = vi.hoisted(() => {
    const integrationGetOpenAI = () => ({
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [
                        {
                            message: {
                                content:
                                    'Water: This is a deterministic integration-test reply from the mocked model.',
                            },
                        },
                    ],
                }),
            },
        },
        audio: {
            speech: {
                create: vi.fn().mockResolvedValue({
                    arrayBuffer: async () => new ArrayBuffer(8),
                }),
            },
            transcriptions: {
                create: vi.fn().mockResolvedValue({ words: [] }),
            },
        },
    });
    return { integrationGetOpenAI };
});

vi.mock('@services/OpenAIService.js', () => ({
    getOpenAI: integrationGetOpenAI,
}));

function validCreateBody() {
    return {
        topic: { id: 't-socket', title: 'Socket Topic', description: 'D', prompt: 'Prompt' },
        characters: [
            {
                id: 'water',
                name: 'Water',
                type: 'food',
                voice: 'alloy',
            },
            {
                id: 'tomato',
                name: 'Tomato',
                type: 'food',
                voice: 'alloy',
            },
        ],
        language: 'en',
    };
}

function waitForSocketEvent(socket, event, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            socket.off(event, onEvt);
            reject(new Error(`timeout waiting for ${event}`));
        }, timeoutMs);
        function onEvt(payload) {
            clearTimeout(t);
            resolve(payload);
        }
        socket.once(event, onEvt);
    });
}

describe('HTTP + Socket full chain (integration)', () => {
    let httpServer;
    let io;
    let port;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerMeetingRoutes(app, 'test');
        httpServer = http.createServer(app);
        io = new Server(httpServer);
        io.on('connection', (socket) => {
            new SocketManager(socket, 'test');
        });
        port = await new Promise((resolve, reject) => {
            httpServer.listen(0, '127.0.0.1', () => {
                const addr = httpServer.address();
                if (addr && typeof addr !== 'string') resolve(addr.port);
                else reject(new Error('no port'));
            });
            httpServer.on('error', reject);
        });
    });

    afterAll(async () => {
        await new Promise((resolve) => io?.close(() => resolve()));
        await new Promise((resolve) => httpServer?.close(() => resolve()));
    });

    afterEach(() => {
        clearLiveSessionRegistryForTests();
    });

    const base = () => `http://127.0.0.1:${port}`;

    it('POST → GET (auth) → start_conversation yields conversation_update', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        expect(createRes.status).toBe(201);
        const { meetingId, creatorKey } = await createRes.json();

        const getRes = await fetch(`${base()}/api/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${creatorKey}` },
        });
        expect(getRes.status).toBe(200);

        const socket = ioClient(`${base()}`, {
            transports: ['websocket'],
            autoConnect: false,
        });
        socket.connect();

        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
            socket.once('connect', () => {
                clearTimeout(t);
                resolve();
            });
            socket.once('connect_error', (e) => {
                clearTimeout(t);
                reject(e);
            });
        });

        const updatePromise = waitForSocketEvent(socket, 'conversation_update');

        socket.emit('start_conversation', {
            meetingId: Number(meetingId),
            creatorKey,
        });

        const conversation = await updatePromise;
        expect(Array.isArray(conversation)).toBe(true);
        expect(conversation.length).toBeGreaterThan(0);

        socket.close();
    });

    it('second socket start_conversation on same meeting gets conversation_error 409', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId, creatorKey } = await createRes.json();

        const socket1 = ioClient(`${base()}`, { transports: ['websocket'], autoConnect: false });
        const socket2 = ioClient(`${base()}`, { transports: ['websocket'], autoConnect: false });
        socket1.connect();
        socket2.connect();

        await Promise.all([
            new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('s1 timeout')), 5000);
                socket1.once('connect', () => {
                    clearTimeout(t);
                    resolve();
                });
                socket1.once('connect_error', (e) => {
                    clearTimeout(t);
                    reject(e);
                });
            }),
            new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('s2 timeout')), 5000);
                socket2.once('connect', () => {
                    clearTimeout(t);
                    resolve();
                });
                socket2.once('connect_error', (e) => {
                    clearTimeout(t);
                    reject(e);
                });
            }),
        ]);

        const errPromise = waitForSocketEvent(socket2, 'conversation_error', 5000);
        socket1.emit('start_conversation', { meetingId: Number(meetingId), creatorKey });
        await waitForSocketEvent(socket1, 'conversation_update', 8000);

        socket2.emit('start_conversation', { meetingId: Number(meetingId), creatorKey });
        const err = await errPromise;
        expect(err.code).toBe(409);
        expect(err.message).toBe('This meeting is happening somewhere else');

        socket1.close();
        socket2.close();
    });

    describe('PUT /api/meetings/:meetingId (resume)', () => {
        async function seedIncompleteMeeting(meetingId) {
            const createRes = await fetch(`${base()}/api/meetings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validCreateBody()),
            });
            const { meetingId: createdId, creatorKey } = await createRes.json();
            const id = meetingId ?? Number(createdId);
            await meetingsCollection.updateOne(
                { _id: Number(createdId) },
                {
                    $set: {
                        conversation: [
                            { id: 'r-m0', type: 'message', speaker: 'water', text: 'hi' },
                            { id: 'r-m1', type: 'message', speaker: 'water', text: 'pending' },
                            { type: 'awaiting_human_question', speaker: 'h', text: '' },
                        ],
                        audio: ['r-m0', 'orphan'],
                        maximumPlayedIndex: 2,
                    },
                }
            );
            return { meetingId: Number(createdId), originalCreatorKey: creatorKey, id };
        }

        it('rotates the creatorKey, trims audio, and returns the updated meeting', async () => {
            const { meetingId, originalCreatorKey } = await seedIncompleteMeeting();

            const res = await fetch(`${base()}/api/meetings/${meetingId}`, { method: 'PUT' });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.creatorKey).toMatch(/^[0-9a-f-]{36}$/i);
            expect(body.creatorKey).not.toBe(originalCreatorKey);
            expect(body.meeting.creatorKey).toBeUndefined();
            expect(body.meeting.conversation.map((c) => c.id)).toEqual(['r-m0']);
            expect(body.meeting.audio).toEqual(['r-m0']);
            // `maximumPlayedIndex` is *not* reset by resume — it's still the seeded 2.
            // Live catch-up via `report_maximum_played_index` will nudge it forward.
            expect(body.meeting.maximumPlayedIndex).toBe(2);

            const stored = await meetingsCollection.findOne({ _id: meetingId });
            expect(stored.creatorKey).toBe(body.creatorKey);
            expect(stored.audio).toEqual(['r-m0']);
            expect(stored.conversation.map((c) => c.id)).toEqual(['r-m0']);
        });

        it('returns 409 when a live session currently holds the meeting', async () => {
            const { meetingId, originalCreatorKey } = await seedIncompleteMeeting();
            tryAcquireLiveSession(meetingId, 'some-socket', 'some-key');

            const res = await fetch(`${base()}/api/meetings/${meetingId}`, { method: 'PUT' });
            expect(res.status).toBe(409);

            const stored = await meetingsCollection.findOne({ _id: meetingId });
            expect(stored.creatorKey).toBe(originalCreatorKey);
        });

        it('returns 400 when the meeting already has a summary', async () => {
            const { meetingId } = await seedIncompleteMeeting();
            await meetingsCollection.updateOne(
                { _id: meetingId },
                { $set: { summary: { id: 's', type: 'summary', text: 'done' } } }
            );

            const res = await fetch(`${base()}/api/meetings/${meetingId}`, { method: 'PUT' });
            expect(res.status).toBe(400);
        });

        it('returns 404 for an unknown meeting id', async () => {
            const res = await fetch(`${base()}/api/meetings/99999999`, { method: 'PUT' });
            expect(res.status).toBe(404);
        });

        it('lets the new creatorKey start a fresh live session that picks up the sanitized conversation', async () => {
            const { meetingId } = await seedIncompleteMeeting();

            const putRes = await fetch(`${base()}/api/meetings/${meetingId}`, { method: 'PUT' });
            const { creatorKey } = await putRes.json();

            const socket = ioClient(`${base()}`, { transports: ['websocket'], autoConnect: false });
            socket.connect();
            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
                socket.once('connect', () => {
                    clearTimeout(t);
                    resolve();
                });
                socket.once('connect_error', (e) => {
                    clearTimeout(t);
                    reject(e);
                });
            });

            const updatePromise = waitForSocketEvent(socket, 'conversation_update');
            socket.emit('start_conversation', { meetingId, creatorKey });
            const conversation = await updatePromise;
            expect(Array.isArray(conversation)).toBe(true);
            expect(conversation.some((m) => m.id === 'r-m0')).toBe(true);

            socket.close();
        });
    });

    it('attempt_reconnection with wrong creatorKey gets conversation_error 403', async () => {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCreateBody()),
        });
        const { meetingId, creatorKey } = await createRes.json();

        const socket = ioClient(`${base()}`, { transports: ['websocket'], autoConnect: false });
        socket.connect();
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
            socket.once('connect', () => {
                clearTimeout(t);
                resolve();
            });
            socket.once('connect_error', (e) => {
                clearTimeout(t);
                reject(e);
            });
        });

        const errPromise = waitForSocketEvent(socket, 'conversation_error', 5000);
        socket.emit('attempt_reconnection', {
            meetingId: Number(meetingId),
            creatorKey: 'not-the-real-key',
            handRaised: false,
            conversationMaxLength: 20,
        });
        const err = await errPromise;
        expect(err.code).toBe(403);
        expect(err.message).toBe('Forbidden');

        socket.close();
    });
});
