import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInworldCall, getInworldIceServers } from "@api/voiceGuideSession.js";

vi.mock("../src/config.js", () => ({
    config: {
        INWORLD_API_KEY: "test-inworld-api-key",
    },
}));

vi.mock("@utils/Logger.js", () => ({
    Logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const SDP_OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const SDP_ANSWER = "v=0\r\no=- 9 2 IN IP4 0.0.0.0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

describe("voiceGuideSession", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getInworldIceServers", () => {
        it("fetches Inworld ICE servers with Bearer auth and unwraps the response", async () => {
            const ice = [
                { urls: ["stun:stun.l.google.com:19302"] },
                { urls: ["turn:turn.example.com:3478"], username: "u", credential: "c" },
            ];
            vi.mocked(global.fetch).mockResolvedValue(
                new Response(JSON.stringify({ ice_servers: ice }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const result = await getInworldIceServers();

            expect(result).toEqual({ iceServers: ice });
            expect(global.fetch).toHaveBeenCalledWith(
                "https://api.inworld.ai/v1/realtime/ice-servers",
                expect.objectContaining({
                    method: "GET",
                    headers: expect.objectContaining({
                        Authorization: "Bearer test-inworld-api-key",
                    }),
                })
            );
        });

        it("returns an empty list when Inworld omits ice_servers", async () => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response(JSON.stringify({}), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const result = await getInworldIceServers();
            expect(result).toEqual({ iceServers: [] });
        });

        it("throws when Inworld returns a non-OK response", async () => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response("forbidden", { status: 403, statusText: "Forbidden" })
            );

            await expect(getInworldIceServers()).rejects.toThrow(
                /Inworld \/v1\/realtime\/ice-servers failed \(403\)/
            );
        });
    });

    describe("createInworldCall", () => {
        it("POSTs JSON {sdp, session} with Bearer auth and returns parsed response", async () => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response(JSON.stringify({ id: "call_abc123", sdp: SDP_ANSWER, ice_servers: [] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const result = await createInworldCall({
                sdp: SDP_OFFER,
                session: { model: "llama-3.3-70b-versatile", instructions: "hello", output_modalities: ["audio", "text"] },
            });

            expect(result.id).toBe("call_abc123");
            expect(result.sdp).toBe(SDP_ANSWER);
            expect(global.fetch).toHaveBeenCalledWith(
                "https://api.inworld.ai/v1/realtime/calls",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        Authorization: "Bearer test-inworld-api-key",
                        "Content-Type": "application/json",
                    }),
                })
            );
        });

        it("rejects an empty SDP offer without calling Inworld", async () => {
            await expect(createInworldCall({ sdp: "" })).rejects.toThrow(/non-empty/);
            await expect(createInworldCall({ sdp: "   \n  " })).rejects.toThrow(/non-empty/);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("throws when Inworld returns non-OK", async () => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response("bad", { status: 400, statusText: "Bad Request" })
            );

            await expect(createInworldCall({ sdp: SDP_OFFER })).rejects.toThrow(/calls failed \(400\)/);
        });

        it("throws when Inworld returns an empty SDP answer", async () => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response(JSON.stringify({ id: "call_x", sdp: "   " }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            await expect(createInworldCall({ sdp: SDP_OFFER })).rejects.toThrow(/empty SDP answer/);
        });
    });
});
