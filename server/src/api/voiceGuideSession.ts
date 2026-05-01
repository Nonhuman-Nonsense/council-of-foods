import type { Express, Request, Response as ExpressResponse } from "express";
import { Logger } from "@utils/Logger.js";
import {
    buildVoiceGuideRealtimeSessionFragment,
    createInworldCall,
    getInworldIceServers,
} from "./realtimeProviders.js";

export { createInworldCall, getInworldIceServers };
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
 *   GET  /api/voice-guide/bootstrap : { iceServers, session } — Inworld ICE + session fragment (model/VAD/voice from GlobalOptions + default character-setup chair)
 *   POST /api/voice-guide/call      : { sdp, session? } -> { id, sdp, ice_servers? }
 */

/** Wires the voice-guide proxy endpoints onto the express app. */
export function registerVoiceGuideRoutes(app: Express): void {
    app.get("/api/voice-guide/bootstrap", async (_req: Request, res: ExpressResponse) => {
        try {
            const [ice, session] = await Promise.all([
                getInworldIceServers(),
                Promise.resolve(buildVoiceGuideRealtimeSessionFragment("en", "inworld")),
            ]);
            res.status(200).json({ provider: "inworld", iceServers: ice.iceServers, session });
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
