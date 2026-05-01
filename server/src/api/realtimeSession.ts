import type { Express, Request, Response as ExpressResponse } from "express";
import { meetingsCollection } from "@services/DbService.js";
import { Logger } from "@utils/Logger.js";
import {
    createRealtimeCall,
    getHumanInputRealtimeBootstrap,
    getVoiceGuideRealtimeBootstrap,
} from "./realtimeProviders.js";
import type {
    HumanInputRealtimeBootstrapRequest,
    HumanInputRealtimeCallRequest,
    RealtimeFeature,
    VoiceGuideRealtimeBootstrapRequest,
    VoiceGuideRealtimeCallRequest,
} from "@shared/RealtimeSessionTypes.js";

const BEARER = /^Bearer\s+(.+)$/i;

function parseRequiredBearerToken(req: Request): string | null {
    const raw = req.headers.authorization;
    const header = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (!header) return null;
    const match = header.match(BEARER);
    return match ? match[1].trim() : null;
}

export function registerRealtimeRoutes(app: Express): void {
    app.post("/api/realtime/bootstrap", async (req: Request, res: ExpressResponse) => {
        const body = (req.body ?? {}) as
            | HumanInputRealtimeBootstrapRequest
            | VoiceGuideRealtimeBootstrapRequest;
        const feature: RealtimeFeature | undefined = body?.feature;

        if (feature !== "human-input" && feature !== "voice-guide") {
            res.status(400).json({ message: "Invalid request" });
            return;
        }

        try {
            if (feature === "voice-guide") {
                const data = await getVoiceGuideRealtimeBootstrap();
                await Logger.info("api", `POST /api/realtime/bootstrap successful (${feature}:${data.provider})`);
                res.status(200).json(data);
                return;
            }

            const bearer = parseRequiredBearerToken(req);
            if (!bearer) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }

            const exists = await meetingsCollection.findOne({ liveKey: bearer }, { projection: { _id: 1 } });
            if (!exists) {
                res.status(403).json({ message: "Forbidden" });
                return;
            }

            const { language } = body as HumanInputRealtimeBootstrapRequest;
            if (typeof language !== "string" || language.trim().length === 0) {
                res.status(400).json({ message: "Invalid request" });
                return;
            }

            const data = await getHumanInputRealtimeBootstrap(language);
            await Logger.info("api", `POST /api/realtime/bootstrap successful (${feature}:${data.provider})`);
            res.status(200).json(data);
        } catch (e) {
            await Logger.error("api", "POST /api/realtime/bootstrap failed", e);
            res.status(500).json({ message: "Realtime bootstrap unavailable" });
        }
    });

    app.post("/api/realtime/call", async (req: Request, res: ExpressResponse) => {
        const body = (req.body ?? {}) as Partial<HumanInputRealtimeCallRequest | VoiceGuideRealtimeCallRequest>;
        const feature: RealtimeFeature | undefined = body?.feature;

        if (
            (feature !== "human-input" && feature !== "voice-guide") ||
            (body.provider !== "inworld" && body.provider !== "openai") ||
            typeof body.sdp !== "string" ||
            !body.session ||
            typeof body.session !== "object"
        ) {
            res.status(400).json({ message: "Invalid request" });
            return;
        }

        try {
            if (feature === "human-input") {
                const bearer = parseRequiredBearerToken(req);
                if (!bearer) {
                    res.status(401).json({ message: "Unauthorized" });
                    return;
                }

                const exists = await meetingsCollection.findOne({ liveKey: bearer }, { projection: { _id: 1 } });
                if (!exists) {
                    res.status(403).json({ message: "Forbidden" });
                    return;
                }
            } else if (body.provider !== "inworld") {
                res.status(400).json({ message: "Invalid request" });
                return;
            }

            const data = await createRealtimeCall(body.provider, { sdp: body.sdp, session: body.session });
            await Logger.info("api", `POST /api/realtime/call successful (${feature}:${body.provider})`);
            res.status(200).json(data);
        } catch (e) {
            await Logger.error("api", "POST /api/realtime/call failed", e);
            res.status(500).json({ message: "Realtime call unavailable" });
        }
    });
}
