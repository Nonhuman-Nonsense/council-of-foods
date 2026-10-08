import type { Express, Request, Response } from "express";
import { z } from "zod";
import { CLIENT_LOG_LIMITS, LOG_CATEGORIES } from "@shared/ClientLogTypes.js";
import { clientLogCollection } from "@services/DbService.js";
import { Logger } from "@utils/Logger.js";
import { resolveVenueId } from "@utils/venues.js";

/**
 * Stores browsers' console logs, sent while #staff → Logging → "Send log to server" is on,
 * so a kiosk's log can be read after the fact (`npm run logs`).
 *
 * The endpoint is open — the page has no secret to send. What keeps it ours is that only a
 * batch shaped exactly like the client's is accepted (unknown fields, unknown categories,
 * oversized lines and implausible clocks are all refused), plus a rate limit so a flood
 * cannot push the real logs out of the capped collection.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ClientLogContextSchema = z.strictObject({
    setupId: z.string().regex(UUID).optional(),
    meetingId: z.number().int().positive().optional(),
});

function serializedLength(value: unknown): number {
    return JSON.stringify(value)?.length ?? 0;
}

const ClientLogLineSchema = z.strictObject({
    t: z.number().int().positive(),
    cat: z.enum(LOG_CATEGORIES),
    msg: z.string().max(CLIENT_LOG_LIMITS.maxMessageChars),
    data: z
        .unknown()
        .refine((data) => serializedLength(data) <= CLIENT_LOG_LIMITS.maxDataChars, "data too large")
        .optional(),
    ctx: ClientLogContextSchema.optional(),
});

export const ClientLogBatchSchema = z.strictObject({
    pageId: z.string().regex(UUID),
    seq: z.number().int().nonnegative(),
    venueId: z.string().max(CLIENT_LOG_LIMITS.maxIdChars).optional(),
    dropped: z.number().int().nonnegative().optional(),
    lines: z.array(ClientLogLineSchema).min(1).max(CLIENT_LOG_LIMITS.maxLines),
});

/** Per sender. A kiosk sends about 12 a minute, more while catching up after an outage. */
export const CLIENT_LOG_BATCHES_PER_MINUTE = 120;
/** Across everyone: the most the server takes, whoever is sending. */
export const CLIENT_LOG_BATCHES_PER_MINUTE_TOTAL = 2_000;
const MINUTE_MS = 60_000;

let windowStart = 0;
let totalInWindow = 0;
const perSender = new Map<string, number>();

/** Test hook. */
export function _resetClientLogRateLimitsForTests(): void {
    windowStart = 0;
    totalInWindow = 0;
    perSender.clear();
}

/** Fixed one-minute windows: enough to stop a flood, cheap enough to run on every batch. */
function takeRateLimitSlot(sender: string, now = Date.now()): boolean {
    if (now - windowStart >= MINUTE_MS) {
        windowStart = now;
        totalInWindow = 0;
        perSender.clear();
    }
    const sent = perSender.get(sender) ?? 0;
    if (sent >= CLIENT_LOG_BATCHES_PER_MINUTE || totalInWindow >= CLIENT_LOG_BATCHES_PER_MINUTE_TOTAL) {
        return false;
    }
    perSender.set(sender, sent + 1);
    totalInWindow += 1;
    return true;
}

/** The sender as best we can tell behind a proxy. Spoofable, which is fine for a rough limit. */
function senderOf(req: Request): string {
    const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || req.ip || "unknown";
}

export function registerClientLogRoutes(app: Express): void {
    app.post("/api/client-log", async (req: Request, res: Response) => {
        const parsed = ClientLogBatchSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid client log batch" });
            return;
        }
        const batch = parsed.data;

        const now = Date.now();
        if (batch.lines.some((line) => Math.abs(line.t - now) > CLIENT_LOG_LIMITS.maxClockSkewMs)) {
            res.status(400).json({ message: "Invalid client log batch" });
            return;
        }
        const venueId = batch.venueId ? resolveVenueId(batch.venueId) : undefined;
        if (batch.venueId && !venueId) {
            res.status(400).json({ message: "Invalid client log batch" });
            return;
        }

        if (!takeRateLimitSlot(senderOf(req), now)) {
            res.status(429).json({ message: "Too many client log batches" });
            return;
        }

        const collection = clientLogCollection;
        if (!collection) {
            res.status(503).json({ message: "Client log unavailable" });
            return;
        }

        const setupIds = new Set<string>();
        const meetingIds = new Set<number>();
        for (const line of batch.lines) {
            if (line.ctx?.setupId) setupIds.add(line.ctx.setupId);
            if (line.ctx?.meetingId) meetingIds.add(line.ctx.meetingId);
        }

        try {
            await collection.insertOne({
                receivedAt: new Date(now),
                pageId: batch.pageId,
                seq: batch.seq,
                ...(venueId ? { venueId } : {}),
                ...(batch.dropped ? { dropped: batch.dropped } : {}),
                setupIds: [...setupIds],
                meetingIds: [...meetingIds],
                lines: batch.lines,
            });
        } catch (error) {
            // A side channel: worth a console line, never an ErrorBot report.
            Logger.info("api", `POST /api/client-log could not store a batch: ${String(error)}`);
            res.status(500).json({ message: "Client log not stored" });
            return;
        }
        res.status(204).end();
    });
}
