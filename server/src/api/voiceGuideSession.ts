import type { Express, Request, Response as ExpressResponse } from "express";
import characterSetupEn from "@shared/prompts/foods_en.json" with { type: "json" };
import { config } from "../config.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { Logger } from "@utils/Logger.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

const opts = getGlobalOptions();
/** Chair realtime output — aligns with characters[0] in shared/prompts/foods_en.json. */
const chair = characterSetupEn.characters[0];
/**
 * Server-side proxy for the Inworld Realtime API used by the NewMeeting voice guide.
 *
 * Why a proxy: Inworld doesn't currently mint OpenAI-style ephemeral
 * `client_secret` tokens for the Realtime API. Auth is either Basic (raw API
 * key, server-only) or HMAC-SHA256 JWT issued by the backend. Forwarding the
 * WebRTC handshake through our server is the simplest pattern that keeps
 * `INWORLD_API_KEY` server-side and works identically for the museum kiosk
 * and the public website. After the SDP exchange the audio flows directly
 * between the browser and Inworld's media servers, so this is not on the
 * audio hot path.
 *
 * Endpoints:
 *   GET  /api/voice-guide/bootstrap : { iceServers, session } — Inworld ICE + session fragment (model/VAD/voice from GlobalOptions + foods_en chair)
 *   POST /api/voice-guide/call      : { sdp, session? } -> { id, sdp, ice_servers? }
 */

const INWORLD_BASE = "https://api.inworld.ai";

export interface IceServer {
    urls: string[] | string;
    username?: string;
    credential?: string;
}

export interface InworldCallResponse {
    id: string;
    sdp: string;
    ice_servers?: IceServer[];
}

/** Tiny wrapper that adds Bearer auth + uniform error handling to an Inworld fetch. */
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

/** Fetch Inworld's STUN/TURN servers so the browser can seed `RTCPeerConnection`. */
export async function getInworldIceServers(): Promise<{ iceServers: IceServer[] }> {
    const response = await inworldFetch("/v1/realtime/ice-servers", { method: "GET" }, "voiceGuide.iceServers");
    const data = (await response.json()) as { ice_servers?: IceServer[] };
    return { iceServers: Array.isArray(data.ice_servers) ? data.ice_servers : [] };
}

/** POST `{ sdp, session? }` to Inworld and return the SDP answer + ICE config. */
export async function createInworldCall(req: { sdp: string; session?: unknown }): Promise<InworldCallResponse> {
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
        "voiceGuide.call"
    );
    const data = (await response.json()) as InworldCallResponse;
    if (typeof data?.sdp !== "string" || data.sdp.trim().length === 0) {
        throw new Error("Inworld /v1/realtime/calls returned an empty SDP answer");
    }
    return data;
}

/** Session fragment merged client-side with instructions/tools (no network). */
function buildVoiceGuideRealtimeSessionFragment() {
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

/** Wires the voice-guide proxy endpoints onto the express app. */
export function registerVoiceGuideRoutes(app: Express): void {
    app.get("/api/voice-guide/bootstrap", async (_req: Request, res: ExpressResponse) => {
        try {
            const [ice, session] = await Promise.all([
                getInworldIceServers(),
                Promise.resolve(buildVoiceGuideRealtimeSessionFragment()),
            ]);
            res.status(200).json({ iceServers: ice.iceServers, session });
        } catch (e) {
            await Logger.error("api", "GET /api/voice-guide/bootstrap failed", e);
            res.status(500).json({ message: "Voice guide unavailable" });
        }
    });

    app.post("/api/voice-guide/call", async (req: Request, res: ExpressResponse) => {
        const body = req.body as { sdp?: unknown; session?: unknown } | undefined;
        if (!body || typeof body.sdp !== "string") {
            res.status(400).json({ message: "Invalid request" });
            return;
        }
        try {
            res.status(200).json(await createInworldCall({ sdp: body.sdp, session: body.session }));
        } catch (e) {
            await Logger.error("api", "POST /api/voice-guide/call failed", e);
            res.status(500).json({ message: "Voice guide unavailable" });
        }
    });
}
