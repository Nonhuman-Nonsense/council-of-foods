import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { Logger } from "@utils/Logger.js";
import { createMeeting } from "./createMeeting.js";
import { getMeeting } from "./getMeeting.js";
import { buildReplayMeetingManifest } from "./replayManifest.js";
import { getClientKey } from "./getClientKey.js";
import { meetingsCollection } from "@services/DbService.js";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "@models/Errors.js";

const BEARER = /^Bearer\s+(.+)$/i;

function authorizationHeader(req: Request): string | undefined {
    const raw = req.headers.authorization;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
}

function parseOptionalBearerToken(req: Request): string | undefined {
    const h = authorizationHeader(req);
    if (!h) return undefined;
    const m = h.match(BEARER);
    return m ? m[1].trim() : undefined;
}

function parseRequiredBearerToken(req: Request): string {
    const bearer = parseOptionalBearerToken(req);
    if (!bearer) {
        throw new UnauthorizedError();
    }
    return bearer;
}

async function apiRouteWithErrorHandling(
    method: string,
    path: string,
    req: Request,
    res: Response,
    handler: (req: Request, res: Response) => Promise<void>
): Promise<void> {
    try {
        await handler(req, res);
    } catch (e: unknown) {
        if (e instanceof ZodError) {
            await Logger.warn("api", `${method} ${path} failed, validation error`, e);
            res.status(400).json({ message: e.message });
            return;
        }
        if (e instanceof NotFoundError) {
            await Logger.warn("api", `${method} ${path} failed, not found`, e);
            res.status(404).json({ message: e.message });
            return;
        }
        if (e instanceof UnauthorizedError) {
            await Logger.warn("api", `${method} ${path} failed, unauthorized`, e);
            res.status(401).json({ message: e.message });
            return;
        }
        if (e instanceof ForbiddenError) {
            await Logger.warn("api", `${method} ${path} failed, forbidden`, e);
            res.status(403).json({ message: e.message });
            return;
        }
        if (e instanceof BadRequestError) {
            await Logger.warn("api", `${method} ${path} failed, bad request`, e);
            res.status(400).json({ message: e.message });
            return;
        }
        await Logger.error("api", `${method} ${path} failed, internal server error`, e);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

/**
 * REST endpoints for meeting lifecycle: create (POST) and fetch for the SPA (GET, creator-authenticated).
 */
export function registerMeetingRoutes(app: Express, environment: string): void {

    app.post("/api/meetings", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("POST", "/api/meetings", req, res, async (req: Request, res: Response) => {
            const { meetingId, creatorKey } = await createMeeting(req.body, environment);
            await Logger.info("api", `POST /api/meetings successful: ${meetingId}`);
            res.status(201).json({ meetingId, creatorKey });
        });
    });

    app.get("/api/meetings/:meetingId", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("GET", "/api/meetings/:meetingId", req, res, async (req: Request, res: Response) => {
            const bearer = parseOptionalBearerToken(req);
            const meeting = await getMeeting(Number(req.params.meetingId), bearer);
            if (!bearer) {
                const manifest = buildReplayMeetingManifest(meeting);
                await Logger.info("api", `GET /api/meetings/${req.params.meetingId} replay`);
                res.status(200).json(manifest);
                return;
            }
            await Logger.info("api", `GET /api/meetings/${req.params.meetingId} live`);
            res.status(200).json(meeting);
        });
    });

    app.post("/api/clientkey", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("POST", "/api/clientkey", req, res, async (req: Request, res: Response) => {
            const bearer = parseRequiredBearerToken(req);

            // Check if the creator key exists in the database
            const exists = await meetingsCollection.findOne({ creatorKey: bearer }, { projection: { _id: 1 } });
            if (!exists) {
                throw new ForbiddenError();
            }

            // Check if the language is valid
            const language = req.body?.language;
            if (
                typeof language !== "string" ||
                !(AVAILABLE_LANGUAGES as readonly string[]).includes(language)
            ) {
                throw new BadRequestError();
            }

            // All good
            // Get the client key
            const data = await getClientKey(language);
            await Logger.info("api", `POST /api/clientkey successful`);
            res.status(200).json(data);
        });
    });
}
