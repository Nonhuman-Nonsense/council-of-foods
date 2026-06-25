import { config } from "../config.js";
import {
    getChairAgentVoice,
    getChairRealtimeLanguageConfig,
    normalizeSetupLanguage,
    type ChairVoiceProfile,
} from "@logic/characterSetupBundle.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { getOpenAI } from "@services/OpenAIService.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";
import type {
    IceServer,
    RealtimeBootstrapResponse,
    RealtimeCallResponse,
    RealtimeFeature,
    RealtimeProvider,
} from "@shared/RealtimeSessionTypes.js";

const opts = getGlobalOptions();
const INWORLD_BASE = "https://api.inworld.ai";
const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

const SEMANTIC_VAD_TURN_DETECTION = {
    type: "semantic_vad" as const,
    eagerness: "medium" as const,
    create_response: true,
    interrupt_response: true,
};

function buildInworldChairRealtimeSession(params: {
    language: string;
    voice: ChairVoiceProfile;
    llmModel: string;
    ttsModel: string;
    transcriptionModel: string;
}): Record<string, unknown> {
    const { language, voice, llmModel, ttsModel, transcriptionModel } = params;
    const normalizedLanguage = normalizeSetupLanguage(language);
    const ttsLanguage = voice.voiceLocale?.trim() || (normalizedLanguage !== "en" ? normalizedLanguage : undefined);

    const session: Record<string, unknown> = {
        type: "realtime" as const,
        model: llmModel,
        output_modalities: ["audio", "text"] as const,
        audio: {
            input: {
                transcription: {
                    model: transcriptionModel,
                    language: ttsLanguage ?? normalizedLanguage,
                },
                turn_detection: SEMANTIC_VAD_TURN_DETECTION,
            },
            output: {
                voice: voice.voice,
                model: ttsModel,
                speed: voice.voiceSpeed ?? opts.defaultAudioSpeed,
            },
        },
    };

    if (ttsLanguage) {
        session.providerData = {
            tts: {
                language: ttsLanguage,
                steering_handling: "emit_once",
                segmenter_strategy: "sentence",
            },
        };
    }

    return session;
}

function buildOpenAIChairRealtimeSession(params: {
    language: string;
    voice: ChairVoiceProfile;
    llmModel: string;
    transcriptionModel: string;
}): Record<string, unknown> {
    const { language, voice, llmModel, transcriptionModel } = params;
    const normalizedLanguage = normalizeSetupLanguage(language);

    return {
        type: "realtime" as const,
        model: llmModel,
        output_modalities: ["audio"] as const,
        audio: {
            input: {
                transcription: {
                    model: transcriptionModel,
                    language: normalizedLanguage,
                },
                turn_detection: SEMANTIC_VAD_TURN_DETECTION,
            },
            output: {
                voice: voice.voice,
                speed: voice.voiceSpeed ?? opts.defaultAudioSpeed,
            },
        },
    };
}

export function buildChairRealtimeSessionFragment(language: string): Record<string, unknown> {
    const normalizedLanguage = normalizeSetupLanguage(language);
    const languageConfig = getChairRealtimeLanguageConfig(normalizedLanguage);
    const voice = getChairAgentVoice(normalizedLanguage);

    if (languageConfig.provider === "openai") {
        return buildOpenAIChairRealtimeSession({
            language: normalizedLanguage,
            voice,
            llmModel: languageConfig.llmModel,
            transcriptionModel: languageConfig.transcriptionModel,
        });
    }

    const ttsModel = languageConfig.ttsModel ?? opts.inworldVoiceModel;
    return buildInworldChairRealtimeSession({
        language: normalizedLanguage,
        voice,
        llmModel: languageConfig.llmModel,
        ttsModel,
        transcriptionModel: languageConfig.transcriptionModel,
    });
}

export function pickChairRealtimeProvider(language: string): RealtimeProvider {
    return getChairRealtimeLanguageConfig(normalizeSetupLanguage(language)).provider;
}

export function pickMetaAgentRealtimeProvider(language: string): RealtimeProvider {
    return pickChairRealtimeProvider(language);
}

export function pickVoiceGuideRealtimeProvider(language: string): RealtimeProvider {
    return pickChairRealtimeProvider(language);
}

export function resolveChairRealtimeCallProvider(
    feature: RealtimeFeature,
    language: string | undefined,
    clientProvider: RealtimeProvider
): RealtimeProvider {
    if (feature !== "meta-agent" && feature !== "voice-guide") {
        return clientProvider;
    }
    if (typeof language !== "string" || language.trim().length === 0) {
        throw new Error(`${feature} realtime call requires language`);
    }
    return pickChairRealtimeProvider(language);
}

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

export function pickHumanInputRealtimeProvider(language: string): RealtimeProvider {
    return normalizeSetupLanguage(language) === "sv" ? "openai" : "inworld";
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

async function getChairRealtimeBootstrap(language: string): Promise<RealtimeBootstrapResponse> {
    const provider = pickChairRealtimeProvider(language);
    const session = buildChairRealtimeSessionFragment(language);

    if (provider === "openai") {
        return {
            provider,
            iceServers: [],
            session,
        };
    }

    const ice = await getInworldIceServers();
    return {
        provider,
        iceServers: ice.iceServers,
        session,
    };
}

export async function getVoiceGuideRealtimeBootstrap(language: string): Promise<RealtimeBootstrapResponse> {
    return getChairRealtimeBootstrap(language);
}

export async function getMetaAgentRealtimeBootstrap(language: string): Promise<RealtimeBootstrapResponse> {
    return getChairRealtimeBootstrap(language);
}

export async function createRealtimeCall(
    provider: RealtimeProvider,
    req: { sdp: string; session?: unknown }
): Promise<RealtimeCallResponse> {
    return provider === "openai" ? createOpenAICall(req) : createInworldCall(req);
}

// Back-compat for tests that referenced the old export name.
export const buildVoiceGuideRealtimeSessionFragment = buildChairRealtimeSessionFragment;
export const buildMetaAgentRealtimeSessionFragment = buildChairRealtimeSessionFragment;
