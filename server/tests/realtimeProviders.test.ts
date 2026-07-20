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

vi.mock("../src/config.js", () => ({
    config: {
        INWORLD_API_KEY: "test-inworld-api-key",
    },
}));

import {
    createInworldCall,
    getHumanInputRealtimeBootstrap,
    getInworldIceServers,
    getMetaAgentRealtimeBootstrap,
    getSetupAgentRealtimeBootstrap,
} from "@api/realtimeProviders.js";

const SDP_ANSWER = "v=0\r\no=- 9 2 IN IP4 0.0.0.0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

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

    it("passes chair STT, TTS, and agent voice into Swedish setup-agent bootstrap", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:guide-sv.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getSetupAgentRealtimeBootstrap("sv");

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

    it("passes chair agent voice into English setup-agent bootstrap", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ ice_servers: [{ urls: ["stun:guide.example.com"] }] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getSetupAgentRealtimeBootstrap("en");

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

});

describe("getInworldIceServers", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

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
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

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
