import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { SocketManager } from '@logic/SocketManager.js';

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
});
