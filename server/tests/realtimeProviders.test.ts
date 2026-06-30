import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Fixture STT model ids — not tied to production global-options.json */
export const HUMAN_INPUT_STT_MODEL = "test/stt-human-input";
export const CHAIR_STT_MODEL = "test/stt-chair";

const { realtimeOptions } = vi.hoisted(() => {
    const HUMAN_INPUT_STT_MODEL = "test/stt-human-input";
    const CHAIR_STT_MODEL = "test/stt-chair";

    const realtimeOptions = {
        defaultAudioSpeed: 1.25,
        inworldVoiceModel: "inworld-tts-1.5-mini",
        transcribeModel: "whisper-1",
        transcribePrompt: { en: "Transcribe", sv: "Transkribera" },
        humanInputRealtime: {
            languages: {
                en: {
                    provider: "inworld" as const,
                    llmModel: "test/llm",
                    transcriptionModel: HUMAN_INPUT_STT_MODEL,
                },
                sv: {
                    provider: "inworld" as const,
                    llmModel: "test/llm",
                    transcriptionModel: HUMAN_INPUT_STT_MODEL,
                },
            },
        },
        chairRealtime: {
            strategy: "split" as const,
            languages: {
                en: {
                    provider: "inworld" as const,
                    llmModel: "test/llm",
                    ttsModel: "test/tts-en",
                    transcriptionModel: CHAIR_STT_MODEL,
                    agentVoice: { voice: "AgentEn", voiceProvider: "inworld" as const },
                },
                sv: {
                    provider: "inworld" as const,
                    llmModel: "test/llm",
                    ttsModel: "test/tts-sv",
                    transcriptionModel: CHAIR_STT_MODEL,
                    agentVoice: {
                        voice: "AgentSv",
                        voiceProvider: "inworld" as const,
                        voiceLocale: "sv",
                    },
                },
            },
        },
    };

    return { realtimeOptions };
});

vi.mock("@logic/GlobalOptions.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@logic/GlobalOptions.js")>();
    return {
        ...actual,
        getGlobalOptions: vi.fn(() => realtimeOptions),
    };
});

vi.mock("@services/OpenAIService.js", () => ({
    getOpenAI: () => ({ apiKey: "test-openai-api-key" }),
}));

vi.mock("../src/config.js", () => ({
    config: {
        INWORLD_API_KEY: "test-inworld-api-key",
    },
}));

import {
    createOpenAICall,
    getHumanInputRealtimeBootstrap,
    getMetaAgentRealtimeBootstrap,
    getVoiceGuideRealtimeBootstrap,
    pickHumanInputRealtimeProvider,
    pickMetaAgentRealtimeProvider,
    pickVoiceGuideRealtimeProvider,
} from "@api/realtimeProviders.js";

const SDP_OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const svChairConfig = realtimeOptions.chairRealtime.languages.sv!;
const enChairConfig = realtimeOptions.chairRealtime.languages.en!;
const swedishAgentChair = svChairConfig.agentVoice!;
const englishAgentChair = enChairConfig.agentVoice!;

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

    it.each([
        { language: "sv", iceUrl: "stun:human-sv.example.com" },
        { language: "en", iceUrl: "stun:stun.example.com" },
    ])(
        "passes human-input STT model and language into Inworld bootstrap ($language)",
        async ({ language, iceUrl }) => {
            vi.mocked(global.fetch).mockResolvedValue(
                new Response(JSON.stringify({ ice_servers: [{ urls: [iceUrl] }] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const result = await getHumanInputRealtimeBootstrap(language);

            expect(result.provider).toBe("inworld");
            expect(result.iceServers).toEqual([{ urls: [iceUrl] }]);
            expect(result.session).toMatchObject({
                type: "realtime",
                output_modalities: ["text"],
                audio: {
                    input: {
                        transcription: {
                            model: HUMAN_INPUT_STT_MODEL,
                            language,
                        },
                    },
                },
            });
            expect(result.session).not.toHaveProperty("providerData");
        }
    );

    it("passes chair STT, TTS, and agent voice into Swedish voice-guide bootstrap", async () => {
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
                        model: CHAIR_STT_MODEL,
                        language: "sv",
                    },
                },
                output: {
                    voice: swedishAgentChair.voice,
                    model: svChairConfig.ttsModel,
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

    it("passes chair agent voice into English voice-guide bootstrap", async () => {
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
                input: {
                    transcription: {
                        model: CHAIR_STT_MODEL,
                        language: "en",
                    },
                },
                output: {
                    voice: englishAgentChair.voice,
                    model: enChairConfig.ttsModel,
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

    it("passes chair STT and meta-agent TTS settings into Swedish bootstrap", async () => {
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
                        model: CHAIR_STT_MODEL,
                        language: "sv",
                    },
                },
                output: {
                    voice: swedishAgentChair.voice,
                    model: svChairConfig.ttsModel,
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

    it("passes chair agent voice and TTS model into English meta-agent bootstrap", async () => {
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
                input: {
                    transcription: {
                        model: CHAIR_STT_MODEL,
                        language: "en",
                    },
                },
                output: {
                    voice: englishAgentChair.voice,
                    model: enChairConfig.ttsModel,
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
