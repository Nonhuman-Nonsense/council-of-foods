import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    createOpenAICall,
    getHumanInputRealtimeBootstrap,
    getMetaAgentRealtimeBootstrap,
    getVoiceGuideRealtimeBootstrap,
    pickHumanInputRealtimeProvider,
    pickMetaAgentRealtimeProvider,
    pickVoiceGuideRealtimeProvider,
} from "@api/realtimeProviders.js";
import { getChairAgentVoice } from "@logic/characterSetupBundle.js";

vi.mock("@services/OpenAIService.js", () => ({
    getOpenAI: () => ({ apiKey: "test-openai-api-key" }),
}));

vi.mock("../src/config.js", () => ({
    config: {
        INWORLD_API_KEY: "test-inworld-api-key",
    },
}));

const SDP_OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const swedishAgentChair = getChairAgentVoice("sv");
const englishAgentChair = getChairAgentVoice("en");

describe("realtimeProviders", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("routes meta-agent sessions to Inworld for all languages", () => {
        expect(pickMetaAgentRealtimeProvider("sv")).toBe("inworld");
        expect(pickMetaAgentRealtimeProvider("sv-SE")).toBe("inworld");
        expect(pickMetaAgentRealtimeProvider("en")).toBe("inworld");
    });

    it("routes human-input transcription from config", () => {
        expect(pickHumanInputRealtimeProvider("sv")).toBe("inworld");
        expect(pickHumanInputRealtimeProvider("sv-SE")).toBe("inworld");
        expect(pickHumanInputRealtimeProvider("en")).toBe("inworld");
    });

    it("routes Swedish voice-guide sessions to Inworld", () => {
        expect(pickVoiceGuideRealtimeProvider("sv")).toBe("inworld");
        expect(pickVoiceGuideRealtimeProvider("sv-SE")).toBe("inworld");
        expect(pickVoiceGuideRealtimeProvider("en")).toBe("inworld");
    });

    it("builds an Inworld transcription bootstrap for Swedish with Soniox", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:human-sv.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getHumanInputRealtimeBootstrap("sv");

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:human-sv.example.com"] }]);
        expect(result.session).toMatchObject({
            type: "realtime",
            output_modalities: ["text"],
            audio: {
                input: {
                    transcription: {
                        model: "soniox/stt-rt-v4",
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
            audio: {
                input: {
                    transcription: {
                        model: "assemblyai/u3-rt-pro",
                        language: "en",
                    },
                },
            },
        });
    });

    it("builds an Inworld voice-guide bootstrap for Swedish with TTS-2", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:guide-sv.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getVoiceGuideRealtimeBootstrap("sv");

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:guide-sv.example.com"] }]);
        expect(result.session).toMatchObject({
            type: "realtime",
            output_modalities: ["audio", "text"],
            audio: {
                input: {
                    transcription: {
                        model: "soniox/stt-rt-v4",
                        language: "sv",
                    },
                },
                output: {
                    voice: swedishAgentChair.voice,
                    model: "inworld-tts-2",
                },
            },
            providerData: {
                tts: {
                    language: "sv",
                    timestamp_type: "WORD",
                    timestamp_transport_strategy: "SYNC",
                },
            },
        });
    });

    it("builds an Inworld voice-guide bootstrap for English", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:guide.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getVoiceGuideRealtimeBootstrap("en");

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:guide.example.com"] }]);
        expect(result.session).toMatchObject({
            type: "realtime",
            output_modalities: ["audio", "text"],
            audio: {
                output: {
                    voice: englishAgentChair.voice,
                },
            },
            providerData: {
                tts: {
                    timestamp_type: "WORD",
                    timestamp_transport_strategy: "SYNC",
                },
            },
        });
    });

    it("builds an Inworld meta-agent bootstrap for Swedish with TTS-2", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:meta-sv.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getMetaAgentRealtimeBootstrap("sv");

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:meta-sv.example.com"] }]);
        expect(result.session).toMatchObject({
            type: "realtime",
            output_modalities: ["audio", "text"],
            audio: {
                input: {
                    transcription: {
                        model: "soniox/stt-rt-v4",
                        language: "sv",
                    },
                },
                output: {
                    voice: swedishAgentChair.voice,
                    model: "inworld-tts-2",
                },
            },
            providerData: {
                tts: {
                    language: "sv",
                    steering_handling: "emit_once",
                    segmenter_strategy: "sentence",
                    timestamp_type: "WORD",
                    timestamp_transport_strategy: "SYNC",
                },
            },
        });
    });

    it("builds an Inworld meta-agent bootstrap for English", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:meta-en.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getMetaAgentRealtimeBootstrap("en");

        expect(result.provider).toBe("inworld");
        expect(result.session).toMatchObject({
            audio: {
                output: {
                    voice: englishAgentChair.voice,
                    model: "inworld-tts-1.5-max",
                },
            },
            providerData: {
                tts: {
                    timestamp_type: "WORD",
                    timestamp_transport_strategy: "SYNC",
                },
            },
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
