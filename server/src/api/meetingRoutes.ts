import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { Logger } from "@utils/Logger.js";
import { createMeeting } from "./createMeeting.js";
import { getMeeting } from "./getMeeting.js";
import { buildReplayMeetingManifest } from "./replayManifest.js";
import { resumeMeeting } from "./resumeMeeting.js";
import { BadRequestError, CouncilError, UnauthorizedError } from "@models/Errors.js";

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
    const context = `api ${method} ${path}`;
    try {
        await handler(req, res);
    } catch (e: unknown) {
        if (e instanceof ZodError) {
            await Logger.warn("api", `${method} ${path} failed, validation error`, e);
            res.status(400).json(CouncilError.fromZod(e).toApiBody(context));
            return;
        }
        if (e instanceof CouncilError) {
            await Logger.warn("api", `${method} ${path} failed, ${e.name}`, e);
            res.status(e.statusCode).json(e.toApiBody(context));
            return;
        }
        await Logger.error("api", `${method} ${path} failed, internal server error`, e);
        res.status(500).json(CouncilError.fromUnexpected(e).toApiBody(context));
    }
}

/**
 * REST endpoints for meeting lifecycle: create (POST) and fetch for the SPA (GET, creator-authenticated).
 */
export function registerMeetingRoutes(app: Express, environment: string): void {

    app.post("/api/meetings", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("POST", "/api/meetings", req, res, async (req: Request, res: Response) => {
            const { meetingId, liveKey } = await createMeeting(req.body, environment);
            await Logger.info("api", `POST /api/meetings successful: ${meetingId}`);
            res.status(201).json({ meetingId, liveKey });
        });
    });

    app.get("/api/meetings/:meetingId", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("GET", "/api/meetings/:meetingId", req, res, async (req: Request, res: Response) => {
            // Get the meeting id from the request params
            const meetingId = req.params.meetingId;
            if (typeof meetingId !== "string" || !/^\d+$/.test(meetingId)) {
                throw new BadRequestError();
            }
            const meetingIdNumber = Number(meetingId);
            const bearer = parseOptionalBearerToken(req);
            const meeting = await getMeeting(meetingIdNumber, bearer);
            if (!bearer) {
                const manifest = buildReplayMeetingManifest(meeting);
                await Logger.info("api", `GET /api/meetings/${meetingId} replay`);
                res.status(200).json(manifest);
                return;
            }
            await Logger.info("api", `GET /api/meetings/${meetingId} live`);
            res.status(200).json(meeting);
        });
    });

    app.put("/api/meetings/:meetingId", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("PUT", "/api/meetings/:meetingId", req, res, async (req: Request, res: Response) => {
            const meetingId = req.params.meetingId;
            if (typeof meetingId !== "string" || !/^\d+$/.test(meetingId)) {
                throw new BadRequestError();
            }
            const meetingIdNumber = Number(meetingId);
            const response = await resumeMeeting(meetingIdNumber);
            await Logger.info("api", `PUT /api/meetings/${meetingId} resumed`);
            res.status(200).json(response);
        });
    });
}
