import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    createOpenAICall,
    getHumanInputRealtimeBootstrap,
    pickHumanInputRealtimeProvider,
} from "@api/realtimeProviders.js";

vi.mock("@services/OpenAIService.js", () => ({
    getOpenAI: () => ({ apiKey: "test-openai-api-key" }),
}));

vi.mock("../src/config.js", () => ({
    config: {
        INWORLD_API_KEY: "test-inworld-api-key",
    },
}));

const SDP_OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

describe("realtimeProviders", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("routes Swedish human-input transcription to OpenAI", () => {
        expect(pickHumanInputRealtimeProvider("sv")).toBe("openai");
        expect(pickHumanInputRealtimeProvider("sv-SE")).toBe("openai");
        expect(pickHumanInputRealtimeProvider("en")).toBe("inworld");
    });

    it("builds an OpenAI transcription bootstrap for Swedish", async () => {
        const result = await getHumanInputRealtimeBootstrap("sv");

        expect(result.provider).toBe("openai");
        expect(result.iceServers).toEqual([]);
        expect(result.session).toMatchObject({
            type: "transcription",
            audio: {
                input: {
                    transcription: {
                        language: "sv",
                    },
                },
            },
        });
    });

    it("builds an Inworld realtime bootstrap for English", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:stun.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getHumanInputRealtimeBootstrap("en");

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:stun.example.com"] }]);
        expect(result.session).toMatchObject({
            type: "realtime",
            output_modalities: ["text"],
        });
    });

    it("POSTs OpenAI calls with server-side auth and FormData", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response("mock_sdp_answer", {
                status: 200,
                headers: {
                    Location: "call_123",
                },
            })
        );

        const result = await createOpenAICall({
            sdp: SDP_OFFER,
            session: { type: "transcription" },
        });

        expect(result).toEqual({ id: "call_123", sdp: "mock_sdp_answer" });
        expect(global.fetch).toHaveBeenCalledWith(
            "https://api.openai.com/v1/realtime/calls",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer test-openai-api-key",
                }),
                body: expect.any(FormData),
            })
        );
    });
});
