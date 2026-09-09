import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import http from "http";
import { registerMeetingRoutes } from "@api/meetingRoutes.js";
import { registerRealtimeRoutes } from "@api/realtimeSession.js";
import { cacheControlPrivateNoStoreApi } from "@utils/httpCache.js";
import { UpstreamHttpError } from "@utils/NetworkUtils.js";
import { CapacityError } from "@models/Errors.js";
import {
    createRealtimeCall,
    getHumanInputRealtimeBootstrap,
    getMetaAgentRealtimeBootstrap,
    getSetupAgentRealtimeBootstrap,
} from "@api/realtimeProviders.js";

vi.mock("@api/realtimeProviders.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@api/realtimeProviders.js")>();
    return {
        ...actual,
        getHumanInputRealtimeBootstrap: vi.fn(),
        getMetaAgentRealtimeBootstrap: vi.fn(),
        getSetupAgentRealtimeBootstrap: vi.fn(),
        createRealtimeCall: vi.fn(),
    };
});

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
        vi.mocked(getMetaAgentRealtimeBootstrap).mockReset();
        vi.mocked(getSetupAgentRealtimeBootstrap).mockReset();
        vi.mocked(createRealtimeCall).mockReset();
        vi.mocked(getHumanInputRealtimeBootstrap).mockResolvedValue({
            provider: "inworld",
            iceServers: [],
            session: { type: "realtime" },
        });
        vi.mocked(getMetaAgentRealtimeBootstrap).mockResolvedValue({
            provider: "inworld",
            iceServers: [{ urls: ["stun:meta.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        vi.mocked(getSetupAgentRealtimeBootstrap).mockResolvedValue({
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

    // A busy account and a broken one want opposite responses from the client:
    // one is worth waiting out, the other is not. Flattening both to 500 left
    // it unable to tell them apart.
    it.each([
        { status: 429, expected: 503, label: "over capacity" },
        { status: 500, expected: 500, label: "upstream failure" },
    ])("answers $expected when the provider is $label", async ({ status, expected }) => {
        vi.mocked(getSetupAgentRealtimeBootstrap).mockRejectedValue(
            new UpstreamHttpError(status, `Inworld /v1/realtime/ice-servers API Error: ${status}`)
        );

        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feature: "setup-agent", language: "en" }),
        });

        expect(res.status).toBe(expected);
        if (expected === 503) {
            expect(res.headers.get("retry-after")).toBe("30");
            expect((await res.json()).message).toBe(CapacityError.clientErrorMessage);
        }
    });

    it("answers 503 when the call endpoint is refused for capacity", async () => {
        vi.mocked(createRealtimeCall).mockRejectedValue(
            new UpstreamHttpError(429, "Inworld /v1/realtime/calls API Error: 429")
        );

        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                feature: "setup-agent",
                provider: "inworld",
                language: "en",
                sdp: "v=0",
                session: { type: "realtime" },
            }),
        });

        expect(res.status).toBe(503);
        expect(res.headers.get("retry-after")).toBe("30");
    });

    it("returns 200 and delegates setup-agent bootstrap without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ feature: "setup-agent", language: "en" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "inworld",
            iceServers: [{ urls: ["stun:guide.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        expect(vi.mocked(getSetupAgentRealtimeBootstrap)).toHaveBeenCalledWith("en");
    });

    it("returns 200 and delegates Swedish setup-agent bootstrap to Inworld", async () => {
        vi.mocked(getSetupAgentRealtimeBootstrap).mockResolvedValueOnce({
            provider: "inworld",
            iceServers: [{ urls: ["stun:guide-sv.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });

        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ feature: "setup-agent", language: "sv" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "inworld",
            iceServers: [{ urls: ["stun:guide-sv.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        expect(vi.mocked(getSetupAgentRealtimeBootstrap)).toHaveBeenCalledWith("sv");
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
                provider: "inworld",
                sdp: "offer",
                session: { type: "transcription" },
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sdp: "mock-answer" });
        expect(vi.mocked(createRealtimeCall)).toHaveBeenCalledWith({
            sdp: "offer",
            session: { type: "transcription" },
        });
    });

    it("returns 200 and delegates setup-agent call without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                feature: "setup-agent",
                provider: "inworld",
                language: "en",
                sdp: "offer",
                session: { type: "realtime" },
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sdp: "mock-answer" });
        expect(vi.mocked(createRealtimeCall)).toHaveBeenCalledWith({
            sdp: "offer",
            session: { type: "realtime" },
        });
    });

    // ── meta-agent ────────────────────────────────────────────────────────────

    it("meta-agent bootstrap returns 401 without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feature: "meta-agent", language: "en" }),
        });
        expect(res.status).toBe(401);
        expect(vi.mocked(getMetaAgentRealtimeBootstrap)).not.toHaveBeenCalled();
    });

    it("meta-agent bootstrap returns 403 with wrong key", async () => {
        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer wrong-key",
            },
            body: JSON.stringify({ feature: "meta-agent", language: "en" }),
        });
        expect(res.status).toBe(403);
        expect(vi.mocked(getMetaAgentRealtimeBootstrap)).not.toHaveBeenCalled();
    });

    it("meta-agent bootstrap returns 200 with valid key", async () => {
        const liveKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/realtime/bootstrap`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${liveKey}`,
            },
            body: JSON.stringify({ feature: "meta-agent", language: "en" }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            provider: "inworld",
            iceServers: [{ urls: ["stun:meta.example.com"] }],
            session: { type: "realtime", output_modalities: ["audio", "text"] },
        });
        expect(vi.mocked(getMetaAgentRealtimeBootstrap)).toHaveBeenCalledWith("en");
    });

    it("meta-agent call returns 401 without Authorization", async () => {
        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                feature: "meta-agent",
                provider: "inworld",
                language: "en",
                sdp: "offer",
                session: { type: "realtime" },
            }),
        });
        expect(res.status).toBe(401);
        expect(vi.mocked(createRealtimeCall)).not.toHaveBeenCalled();
    });

    it("meta-agent call returns 400 without language", async () => {
        const liveKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${liveKey}`,
            },
            body: JSON.stringify({
                feature: "meta-agent",
                provider: "inworld",
                sdp: "offer",
                session: { type: "realtime" },
            }),
        });

        expect(res.status).toBe(400);
        expect(vi.mocked(createRealtimeCall)).not.toHaveBeenCalled();
    });

    it("meta-agent call returns 200 with valid key", async () => {
        const liveKey = await createMeetingAndKey();

        const res = await fetch(`${base()}/api/realtime/call`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${liveKey}`,
            },
            body: JSON.stringify({
                feature: "meta-agent",
                provider: "inworld",
                language: "en",
                sdp: "offer",
                session: { type: "realtime" },
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ sdp: "mock-answer" });
        expect(vi.mocked(createRealtimeCall)).toHaveBeenCalledWith({
            sdp: "offer",
            session: { type: "realtime" },
        });
    });
});
