import type { Express, Request, Response as ExpressResponse } from "express";
import { meetingsCollection } from "@services/DbService.js";
import { Logger } from "@utils/Logger.js";
import { BadRequestError, CouncilError } from "@models/Errors.js";
import {
    createRealtimeCall,
    getHumanInputRealtimeBootstrap,
    getMetaAgentRealtimeBootstrap,
    getSetupAgentRealtimeBootstrap,
    resolveChairRealtimeCallProvider,
} from "./realtimeProviders.js";
import type {
    HumanInputRealtimeBootstrapRequest,
    HumanInputRealtimeCallRequest,
    MetaAgentRealtimeBootstrapRequest,
    MetaAgentRealtimeCallRequest,
    RealtimeFeature,
    RealtimeProvider,
    SetupAgentRealtimeBootstrapRequest,
    SetupAgentRealtimeCallRequest,
} from "@shared/RealtimeSessionTypes.js";

const BEARER = /^Bearer\s+(.+)$/i;

function parseRequiredBearerToken(req: Request): string | null {
    const raw = req.headers.authorization;
    const header = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (!header) return null;
    const match = header.match(BEARER);
    return match ? match[1].trim() : null;
}

function parseCallLanguage(body: Record<string, unknown>): string | undefined {
    return typeof body.language === "string" ? body.language : undefined;
}

export function registerRealtimeRoutes(app: Express): void {
    app.post("/api/realtime/bootstrap", async (req: Request, res: ExpressResponse) => {
        const body = (req.body ?? {}) as
            | HumanInputRealtimeBootstrapRequest
            | MetaAgentRealtimeBootstrapRequest
            | SetupAgentRealtimeBootstrapRequest;
        const feature: RealtimeFeature | undefined = body?.feature;

        if (feature !== "human-input" && feature !== "meta-agent" && feature !== "setup-agent") {
            res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/bootstrap"));
            return;
        }

        try {
            if (feature === "setup-agent") {
                const { language } = body as SetupAgentRealtimeBootstrapRequest;
                if (typeof language !== "string" || language.trim().length === 0) {
                    res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/bootstrap"));
                    return;
                }

                const data = await getSetupAgentRealtimeBootstrap(language);
                await Logger.info("api", `POST /api/realtime/bootstrap successful (${feature}:${data.provider})`);
                res.status(200).json(data);
                return;
            }

            // Both meta-agent and human-input require a valid live-key bearer.
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

            if (feature === "meta-agent") {
                const { language } = body as MetaAgentRealtimeBootstrapRequest;
                if (typeof language !== "string" || language.trim().length === 0) {
                    res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/bootstrap"));
                    return;
                }

                const data = await getMetaAgentRealtimeBootstrap(language);
                await Logger.info("api", `POST /api/realtime/bootstrap successful (${feature}:${data.provider})`);
                res.status(200).json(data);
                return;
            }

            const { language } = body as HumanInputRealtimeBootstrapRequest;
            if (typeof language !== "string" || language.trim().length === 0) {
                res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/bootstrap"));
                return;
            }

            const data = await getHumanInputRealtimeBootstrap(language);
            await Logger.info("api", `POST /api/realtime/bootstrap successful (${feature}:${data.provider})`);
            res.status(200).json(data);
        } catch (e) {
            await Logger.error("api", "POST /api/realtime/bootstrap failed", { error: e });
            res.status(500).json(CouncilError.fromUnexpected(e, "Realtime bootstrap unavailable").toApiBody("api POST /api/realtime/bootstrap"));
        }
    });

    app.post("/api/realtime/call", async (req: Request, res: ExpressResponse) => {
        const body = (req.body ?? {}) as Partial<HumanInputRealtimeCallRequest | MetaAgentRealtimeCallRequest | SetupAgentRealtimeCallRequest>;
        const feature: RealtimeFeature | undefined = body?.feature;
        const language = parseCallLanguage(body as Record<string, unknown>);

        if (
            (feature !== "human-input" && feature !== "meta-agent" && feature !== "setup-agent") ||
            (body.provider !== "inworld" && body.provider !== "openai") ||
            typeof body.sdp !== "string" ||
            !body.session ||
            typeof body.session !== "object"
        ) {
            res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/call"));
            return;
        }

        if ((feature === "meta-agent" || feature === "setup-agent") && (!language || language.trim().length === 0)) {
            res.status(400).json(new BadRequestError().toApiBody("api POST /api/realtime/call"));
            return;
        }

        try {
            if (feature === "human-input" || feature === "meta-agent") {
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
            }

            const provider: RealtimeProvider = resolveChairRealtimeCallProvider(feature, language, body.provider);
            const data = await createRealtimeCall(provider, { sdp: body.sdp, session: body.session });
            await Logger.info("api", `POST /api/realtime/call successful (${feature}:${provider})`);
            res.status(200).json(data);
        } catch (e) {
            await Logger.error("api", "POST /api/realtime/call failed", { error: e });
            res.status(500).json(CouncilError.fromUnexpected(e, "Realtime call unavailable").toApiBody("api POST /api/realtime/call"));
        }
    });
}
