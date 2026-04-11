import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { Logger } from "@utils/Logger.js";
import { createMeeting } from "./createMeeting.js";
import { getMeeting, MeetingNotFoundError } from "./getMeeting.js";

const BEARER = /^Bearer\s+(.+)$/i;

function authorizationHeader(req: Request): string | undefined {
    const raw = req.headers.authorization;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
}

function parseBearerToken(req: Request): string | null {
    const h = authorizationHeader(req);
    if (!h) return null;
    const m = h.match(BEARER);
    return m ? m[1].trim() : null;
}

/**
 * REST endpoints for meeting lifecycle: create (POST) and fetch for the SPA (GET, creator-authenticated).
 */
export function registerMeetingRoutes(app: Express, environment: string): void {
    app.post("/api/meetings", async (req: Request, res: Response) => {
        try {
            const { meetingId, creatorKey } = await createMeeting(req.body, environment);
            await Logger.info("api", `POST /api/meetings successful: ${meetingId}`);
            res.status(201).json({ meetingId, creatorKey });
        } catch (e: unknown) {
            if (e instanceof ZodError) {
                await Logger.warn("api", "POST /api/meetings failed", e);
                res.status(400).json({ message: "Invalid payload" });
                return;
            }
            await Logger.error("api", "POST /api/meetings failed", e);
            res.status(500).json({ message: "Internal Server Error" });
        }
    });

    app.get("/api/meetings/:meetingId", async (req: Request, res: Response) => {
        const bearer = parseBearerToken(req);
        if (!bearer) {
            res.status(401).json({ message: "Authorization required" });
            return;
        }

        const meetingId = Number(req.params.meetingId);
        if (!Number.isInteger(meetingId) || meetingId < 1) {
            res.status(400).json({ message: "Invalid meeting ID" });
            return;
        }

        try {
            const meeting = await getMeeting(meetingId);
            if (bearer !== meeting.creatorKey) {
                res.status(403).json({ message: "Forbidden" });
                return;
            }

            await Logger.info("api", `GET /api/meetings/${req.params.meetingId} successful`);
            res.status(200).json(meeting);
        } catch (e: unknown) {
            if (e instanceof MeetingNotFoundError) {
                res.status(404).json({ message: "Not found" });
                return;
            }
            if (e instanceof ZodError) {
                await Logger.warn("api", `GET /api/meetings/${req.params.meetingId} failed`, e);
                res.status(400).json({ message: "Invalid meeting ID" });
                return;
            }
            await Logger.error("api", `GET /api/meetings/${req.params.meetingId} failed`, e);
            res.status(500).json({ message: "Internal Server Error" });
        }
    });
}
