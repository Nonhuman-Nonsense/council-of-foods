import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { Logger, type LogDetails } from "@utils/Logger.js";
import { createMeeting } from "./createMeeting.js";
import { getMeeting } from "./getMeeting.js";
import { buildReplayMeetingManifest } from "./replayManifest.js";
import { resumeMeeting } from "./resumeMeeting.js";
import { getAutoplayMeeting, parseAutoplayLanguageQuery } from "./getAutoplayMeeting.js";
import { BadRequestError, CouncilError } from "@models/Errors.js";

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

async function apiRouteWithErrorHandling(
    method: string,
    path: string,
    req: Request,
    res: Response,
    handler: (req: Request, res: Response) => Promise<void>
): Promise<void> {
    const context = `api ${method} ${path}`;
    // Captured up front so it's available in the catch block regardless of where the handler
    // throws (e.g. before it has parsed/validated meetingId itself).
    const rawMeetingId = req.params.meetingId;
    const meetingId =
        typeof rawMeetingId === "string" && /^\d+$/.test(rawMeetingId) ? Number(rawMeetingId) : undefined;
    const logDetails: LogDetails = {
        from: { meetingId },
        requestParams: { params: req.params, query: req.query as Record<string, unknown> },
    };
    try {
        await handler(req, res);
    } catch (e: unknown) {
        if (e instanceof ZodError) {
            await Logger.warn("api", `${method} ${req.originalUrl} failed, validation error`, { ...logDetails, error: e });
            res.status(400).json(CouncilError.fromZod(e).toApiBody(context));
            return;
        }
        if (e instanceof CouncilError) {
            const message = `${method} ${req.originalUrl} failed, ${e.name}`;
            if (e.severity === 'info') {
                Logger.info("api", message, { ...logDetails, error: e });
            } else {
                await Logger.warn("api", message, { ...logDetails, error: e });
            }
            res.status(e.statusCode).json(e.toApiBody(context));
            return;
        }
        await Logger.error("api", `${method} ${req.originalUrl} failed, internal server error`, { ...logDetails, error: e });
        res.status(500).json(CouncilError.fromUnexpected(e).toApiBody(context));
    }
}

/**
 * REST endpoints for meeting lifecycle: create (POST) and fetch for the SPA (GET, creator-authenticated).
 */
export function registerMeetingRoutes(app: Express, environment: string): void {

    app.get("/api/autoplay", async (req: Request, res: Response) => {
        await apiRouteWithErrorHandling("GET", "/api/autoplay", req, res, async (_req: Request, res: Response) => {
            const language = parseAutoplayLanguageQuery(req.query.language);
            const { meetingId } = await getAutoplayMeeting(language);
            await Logger.info("api", `GET /api/autoplay → meeting ${meetingId}`);
            res.status(200).json({ meetingId });
        });
    });

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
                if (manifest.conversation.length === 1 && manifest.conversation[0].type === "meeting_incomplete") {
                    await Logger.warn(
                        "api",
                        `GET /api/meetings/${meetingId} replay requested with no playable content yet`,
                        { from: { meetingId: meetingIdNumber } },
                    );
                }
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
