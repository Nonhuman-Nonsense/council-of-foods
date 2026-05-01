import { config } from "../config.js";
import { defaultCharacterSetupBundle } from "@logic/characterSetupBundle.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { getOpenAI } from "@services/OpenAIService.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";
import type {
    IceServer,
    RealtimeBootstrapResponse,
    RealtimeCallResponse,
    RealtimeProvider,
} from "@shared/RealtimeSessionTypes.js";

const opts = getGlobalOptions();
const chair = defaultCharacterSetupBundle.characters[0];
const INWORLD_BASE = "https://api.inworld.ai";
const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

async function inworldFetch(path: string, init: RequestInit, context: string): Promise<Response> {
    const response = await withNetworkRetry(
        () =>
            fetch(`${INWORLD_BASE}${path}`, {
                ...init,
                headers: {
                    Authorization: `Bearer ${config.INWORLD_API_KEY}`,
                    ...(init.headers ?? {}),
                },
            }),
        context
    );
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Inworld ${path} failed (${response.status}): ${text}`);
    }
    return response;
}

export async function getInworldIceServers(): Promise<{ iceServers: IceServer[] }> {
    const response = await inworldFetch("/v1/realtime/ice-servers", { method: "GET" }, "realtime.inworld.iceServers");
    const data = (await response.json()) as { ice_servers?: IceServer[] };
    return { iceServers: Array.isArray(data.ice_servers) ? data.ice_servers : [] };
}

export async function createInworldCall(req: { sdp: string; session?: unknown }): Promise<RealtimeCallResponse> {
    if (typeof req?.sdp !== "string" || req.sdp.trim().length === 0) {
        throw new Error("SDP offer must be a non-empty string");
    }
    const response = await inworldFetch(
        "/v1/realtime/calls",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req),
        },
        "realtime.inworld.call"
    );
    const data = (await response.json()) as RealtimeCallResponse;
    if (typeof data?.sdp !== "string" || data.sdp.trim().length === 0) {
        throw new Error("Inworld /v1/realtime/calls returned an empty SDP answer");
    }
    return data;
}

export async function createOpenAICall(req: { sdp: string; session?: unknown }): Promise<RealtimeCallResponse> {
    if (typeof req?.sdp !== "string" || req.sdp.trim().length === 0) {
        throw new Error("SDP offer must be a non-empty string");
    }

    const openai = getOpenAI();
    const body = new FormData();
    body.set("sdp", req.sdp);
    if (req.session != null) {
        body.set("session", JSON.stringify(req.session));
    }

    const response = await withNetworkRetry(
        () =>
            fetch(OPENAI_CALLS_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${openai.apiKey}`,
                },
                body,
            }),
        "realtime.openai.call"
    );

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`OpenAI /v1/realtime/calls failed (${response.status}): ${text}`);
    }

    const sdp = await response.text();
    if (typeof sdp !== "string" || sdp.trim().length === 0) {
        throw new Error("OpenAI /v1/realtime/calls returned an empty SDP answer");
    }

    return {
        id: response.headers.get("Location") ?? undefined,
        sdp,
    };
}

export function buildVoiceGuideRealtimeSessionFragment(): Record<string, unknown> {
    return {
        type: "realtime" as const,
        model: opts.voiceGuideRealtimeModel,
        output_modalities: ["audio", "text"] as const,
        audio: {
            input: {
                transcription: { model: opts.voiceGuideRealtimeTranscriptionModel },
                turn_detection: {
                    type: "semantic_vad" as const,
                    eagerness: "medium" as const,
                    create_response: true,
                    interrupt_response: true,
                },
            },
            output: {
                voice: chair.voice,
                model: opts.inworldVoiceModel,
                speed: chair.voiceSpeed ?? opts.defaultAudioSpeed,
            },
        },
    };
}

export function pickHumanInputRealtimeProvider(language: string): RealtimeProvider {
    return language.toLowerCase().startsWith("sv") ? "openai" : "inworld";
}

export async function getHumanInputRealtimeBootstrap(language: string): Promise<RealtimeBootstrapResponse> {
    const provider = pickHumanInputRealtimeProvider(language);

    if (provider === "openai") {
        return {
            provider,
            iceServers: [],
            session: {
                type: "transcription",
                audio: {
                    input: {
                        format: { type: "audio/pcm", rate: 24000 },
                        noise_reduction: { type: "near_field" },
                        transcription: {
                            model: opts.transcribeModel,
                            prompt: opts.transcribePrompt[language] ?? opts.transcribePrompt.en ?? "",
                            language,
                        },
                        turn_detection: {
                            type: "server_vad",
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500,
                        },
                    },
                },
            },
        };
    }

    const ice = await getInworldIceServers();
    return {
        provider,
        iceServers: ice.iceServers,
        session: {
            type: "realtime" as const,
            model: opts.voiceGuideRealtimeModel,
            output_modalities: ["text"] as const,
            audio: {
                input: {
                    transcription: {
                        model: opts.voiceGuideRealtimeTranscriptionModel,
                        language,
                    },
                    turn_detection: {
                        type: "semantic_vad" as const,
                        eagerness: "medium" as const,
                        create_response: false,
                        interrupt_response: false,
                    },
                },
            },
        },
    };
}

export async function getVoiceGuideRealtimeBootstrap(): Promise<RealtimeBootstrapResponse> {
    const ice = await getInworldIceServers();
    return {
        provider: "inworld",
        iceServers: ice.iceServers,
        session: buildVoiceGuideRealtimeSessionFragment(),
    };
}

export async function createRealtimeCall(
    provider: RealtimeProvider,
    req: { sdp: string; session?: unknown }
): Promise<RealtimeCallResponse> {
    return provider === "openai" ? createOpenAICall(req) : createInworldCall(req);
}
