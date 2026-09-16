import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { RealtimeFeature } from "@shared/RealtimeSessionTypes.js";
import { BadRequestError, ForbiddenError } from "@models/Errors.js";
import { parseRealtimeUsage, recordUsage } from "@services/UsageService.js";

/**
 * Realtime sessions run browser ↔ Inworld, so only the client sees their usage. The
 * bootstrap hands out a usage token naming the session's feature and tags; reports are
 * accepted only against a live token, per report and per token capped, and clamped per
 * response by {@link parseRealtimeUsage}. That bounds what a forged report can add to the
 * meter without accounts or signatures.
 */

/** Longer than any museum session; a token is minted per connection, so reconnects get fresh ones. */
const USAGE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_RESPONSES_PER_TOKEN = 2_000;
const MAX_RESPONSES_PER_REPORT = 50;
/** Setup-agent bootstrap is unauthenticated, so the registry is bounded; the oldest grants go first. */
const MAX_GRANTS = 10_000;

interface UsageGrant {
    feature: RealtimeFeature;
    meetingId?: number;
    installationId?: string;
    expiresAt: number;
    responses: number;
}

const grants = new Map<string, UsageGrant>();

export function grantRealtimeUsageToken(
    grant: Pick<UsageGrant, "feature" | "meetingId" | "installationId">,
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
    grants.set(token, { ...grant, expiresAt: now + USAGE_TOKEN_TTL_MS, responses: 0 });
    return token;
}

export function clearRealtimeUsageGrantsForTests(): void {
    grants.clear();
}

export const RealtimeUsageReportBody = z.object({
    usageToken: z.string().min(1).max(100),
    responses: z.array(z.unknown()).min(1).max(MAX_RESPONSES_PER_REPORT),
});

export function registerRealtimeUsageRoutes(app: Express): void {
    app.post("/api/usage/realtime", (req: Request, res: Response) => {
        const context = "api POST /api/usage/realtime";
        const parsed = RealtimeUsageReportBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json(new BadRequestError().toApiBody(context));
            return;
        }

        const { usageToken, responses } = parsed.data;
        const grant = grants.get(usageToken);
        if (!grant || grant.expiresAt <= Date.now()) {
            res.status(403).json(new ForbiddenError().toApiBody(context));
            return;
        }

        const accepted = responses.slice(0, Math.max(0, MAX_RESPONSES_PER_TOKEN - grant.responses));
        grant.responses += accepted.length;

        for (const usage of accepted) {
            for (const part of parseRealtimeUsage(usage)) {
                void recordUsage({
                    source: "client",
                    feature: grant.feature,
                    ...part,
                    ...(grant.meetingId !== undefined ? { meetingId: grant.meetingId } : {}),
                    ...(grant.installationId ? { installationId: grant.installationId } : {}),
                });
            }
        }
        res.status(204).end();
    });
}
