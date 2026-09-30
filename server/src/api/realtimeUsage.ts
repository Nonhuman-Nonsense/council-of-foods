import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { RealtimeFeature } from "@shared/RealtimeSessionTypes.js";
import { BadRequestError, ForbiddenError } from "@models/Errors.js";
import { parseRealtimeUsage, recordUsage } from "@services/UsageService.js";

/**
 * Realtime sessions run browser ↔ Inworld, so only the client sees their usage. The
 * bootstrap hands out a usage token naming the session's feature and tags; reports are
 * accepted only against a live token, capped per token, and clamped by
 * {@link parseRealtimeUsage}. That bounds what a forged report can add to the
 * meter without accounts or signatures.
 */

/** Longer than any museum session; a token is minted per connection, so reconnects get fresh ones. */
const USAGE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
/** Reports (one per completed response) a session may send. */
const MAX_REPORTS_PER_TOKEN = 2_000;
/** Setup-agent bootstrap is unauthenticated, so the registry is bounded; the oldest grants go first. */
const MAX_GRANTS = 10_000;

interface UsageGrant {
    feature: RealtimeFeature;
    meetingId?: number;
    venueId?: string;
    expiresAt: number;
    reports: number;
}

const grants = new Map<string, UsageGrant>();

export function grantRealtimeUsageToken(
    grant: Pick<UsageGrant, "feature" | "meetingId" | "venueId">,
    now: number = Date.now(),
): string {
    for (const [token, existing] of grants) {
        if (existing.expiresAt <= now || grants.size >= MAX_GRANTS) {
            grants.delete(token);
        } else {
            break;
        }
    }
    const token = randomUUID();
    grants.set(token, { ...grant, expiresAt: now + USAGE_TOKEN_TTL_MS, reports: 0 });
    return token;
}

export function clearRealtimeUsageGrantsForTests(): void {
    grants.clear();
}

export const RealtimeUsageReportBody = z.object({
    usageToken: z.string().min(1).max(100),
    usage: z.unknown(),
});

export function registerRealtimeUsageRoutes(app: Express): void {
    app.post("/api/usage/realtime", (req: Request, res: Response) => {
        const context = "api POST /api/usage/realtime";
        const parsed = RealtimeUsageReportBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json(new BadRequestError().toApiBody(context));
            return;
        }

        const { usageToken, usage } = parsed.data;
        const grant = grants.get(usageToken);
        if (!grant || grant.expiresAt <= Date.now()) {
            res.status(403).json(new ForbiddenError().toApiBody(context));
            return;
        }

        if (grant.reports < MAX_REPORTS_PER_TOKEN) {
            grant.reports++;
            for (const part of parseRealtimeUsage(usage)) {
                void recordUsage({
                    feature: grant.feature,
                    ...part,
                    ...(grant.meetingId !== undefined ? { meetingId: grant.meetingId } : {}),
                    ...(grant.venueId ? { venueId: grant.venueId } : {}),
                });
            }
        }
        res.status(204).end();
    });
}
