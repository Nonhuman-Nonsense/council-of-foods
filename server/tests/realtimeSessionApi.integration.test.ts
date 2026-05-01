import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { registerMeetingRoutes } from "@api/meetingRoutes.js";
import { registerRealtimeRoutes } from "@api/realtimeSession.js";
import { cacheControlPrivateNoStoreApi } from "@utils/httpCache.js";
import {
    createRealtimeCall,
    getHumanInputRealtimeBootstrap,
    getVoiceGuideRealtimeBootstrap,
} from "@api/realtimeProviders.js";

vi.mock("@api/realtimeProviders.js", () => ({
    getHumanInputRealtimeBootstrap: vi.fn(),
    getVoiceGuideRealtimeBootstrap: vi.fn(),
    createRealtimeCall: vi.fn(),
}));

function validCreateBody() {
    return {
        topic: { id: "t-rt", title: "Topic", description: "D", prompt: "P" },
        characters: [{ id: "speaker1", name: "Speaker 1", description: "D", prompt: "P", voice: "alloy" }],
        language: "en",
    };
}

describe("POST /api/realtime/* (integration)", () => {
    let httpServer: http.Server;
    let port: number;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use("/api", cacheControlPrivateNoStoreApi);
        registerMeetingRoutes(app, "test");
        registerRealtimeRoutes(app);
        httpServer = http.createServer(app);
        port = await new Promise((resolve, reject) => {
            httpServer.listen(0, "127.0.0.1", () => {
                const addr = httpServer.address();
                if (addr && typeof addr !== "string") resolve(addr.port);
                else reject(new Error("no port"));
            });
            httpServer.on("error", reject);
        });
    });

    afterAll(
        async () =>
            new Promise<void>((resolve) => {
                httpServer?.close(() => resolve());
            })
    );

    beforeEach(() => {
        vi.mocked(getHumanInputRealtimeBootstrap).mockReset();
        vi.mocked(getVoiceGuideRealtimeBootstrap).mockReset();
        vi.mocked(createRealtimeCall).mockReset();
        vi.mocked(getHumanInputRealtimeBootstrap).mockResolvedValue({
            provider: "inworld",
            iceServers: [],
            session: { type: "realtime" },
        });
        vi.mocked(getVoiceGuideRealtimeBootstrap).mockResolvedValue({
            provider: "inworld",
            iceServers: [{ urls: ["stun:guide.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        vi.mocked(createRealtimeCall).mockResolvedValue({ sdp: "mock-answer" });
    });

    const base = () => `http://127.0.0.1:${port}`;

    async function createMeetingAndKey() {
        const createRes = await fetch(`${base()}/api/meetings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validCreateBody()),
        });
        expect(createRes.status).toBe(201);
        const { liveKey } = await createRes.json();
        return liveKey;
    }

    it("returns 400 when feature is missing on bootstrap", async () => {
        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: "en" }),
        });
        expect(res.status).toBe(400);
        expect(vi.mocked(getHumanInputRealtimeBootstrap)).not.toHaveBeenCalled();
    });

    it("returns 200 and delegates bootstrap when authorized", async () => {
        const liveKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${liveKey}`,
            },
            body: JSON.stringify({ feature: "human-input", language: "sv" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "inworld",
            iceServers: [],
            session: { type: "realtime" },
        });
        expect(vi.mocked(getHumanInputRealtimeBootstrap)).toHaveBeenCalledWith("sv");
    });

    it("returns 200 and delegates voice-guide bootstrap without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ feature: "voice-guide", language: "en" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "inworld",
            iceServers: [{ urls: ["stun:guide.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        expect(vi.mocked(getVoiceGuideRealtimeBootstrap)).toHaveBeenCalledWith("en");
    });

    it("returns 200 and delegates Swedish voice-guide bootstrap to OpenAI", async () => {
        vi.mocked(getVoiceGuideRealtimeBootstrap).mockResolvedValueOnce({
            provider: "openai",
            iceServers: [],
            session: { type: "realtime", output_modalities: ["audio"] },
        });

        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ feature: "voice-guide", language: "sv" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "openai",
            iceServers: [],
            session: { type: "realtime", output_modalities: ["audio"] },
        });
        expect(vi.mocked(getVoiceGuideRealtimeBootstrap)).toHaveBeenCalledWith("sv");
    });

    it("returns 200 and delegates call when authorized", async () => {
        const liveKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${liveKey}`,
            },
            body: JSON.stringify({
                feature: "human-input",
                provider: "openai",
                sdp: "offer",
                session: { type: "transcription" },
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sdp: "mock-answer" });
        expect(vi.mocked(createRealtimeCall)).toHaveBeenCalledWith("openai", {
            sdp: "offer",
            session: { type: "transcription" },
        });
    });

    it("returns 200 and delegates voice-guide call without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                feature: "voice-guide",
                provider: "openai",
                sdp: "offer",
                session: { type: "realtime" },
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sdp: "mock-answer" });
        expect(vi.mocked(createRealtimeCall)).toHaveBeenCalledWith("openai", {
            sdp: "offer",
            session: { type: "realtime" },
        });
    });
});
