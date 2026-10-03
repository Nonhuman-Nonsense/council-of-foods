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
    /** Setup-agent: the visit's setup, until its meeting exists (then both are set). */
    setupId?: string;
    grantedAt: number;
    expiresAt: number;
    reports: number;
}

const grants = new Map<string, UsageGrant>();

export function grantRealtimeUsageToken(
    grant: Pick<UsageGrant, "feature" | "meetingId" | "venueId" | "setupId">,
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
    grants.set(token, { ...grant, grantedAt: now, expiresAt: now + USAGE_TOKEN_TTL_MS, reports: 0 });
    return token;
}

/**
 * The setup a setup-agent session belongs to: the one it asks to continue, when that is still
 * live and has not yet led to a meeting (a reconnect mid-setup), or else a new one.
 */
export function setupIdFor(requested: string | undefined, now: number = Date.now()): string {
    if (requested) {
        for (const grant of grants.values()) {
            if (grant.setupId === requested && grant.meetingId === undefined && grant.expiresAt > now) {
                return requested;
            }
        }
    }
    return randomUUID();
}

/**
 * The venue's newest setup that has not led to a meeting yet, and when it began — so a meter
 * loading mid-setup starts at zero, before the setup has used anything. In memory, like the
 * grants: after a restart the meter falls back to the setup's recorded usage.
 */
export function latestOpenSetup(venueId: string, now: number = Date.now()): { setupId: string; startedAt: number } | undefined {
    const startedAt = new Map<string, number>();
    const linked = new Set<string>();
    for (const grant of grants.values()) {
        if (!grant.setupId || grant.venueId !== venueId) continue;
        if (grant.meetingId !== undefined) linked.add(grant.setupId);
        if (grant.expiresAt > now) {
            startedAt.set(grant.setupId, Math.min(startedAt.get(grant.setupId) ?? Infinity, grant.grantedAt));
        }
    }
    let latest: { setupId: string; startedAt: number } | undefined;
    for (const [setupId, at] of startedAt) {
        if (!linked.has(setupId) && (!latest || at > latest.startedAt)) latest = { setupId, startedAt: at };
    }
    return latest;
}

/** The setup has led to this meeting: whatever its sessions report from now on is the meeting's. */
export function linkSetupGrants(setupId: string, meetingId: number): void {
    for (const grant of grants.values()) {
        if (grant.setupId === setupId && grant.meetingId === undefined) {
            grant.meetingId = meetingId;
        }
    }
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
                    ...(grant.setupId ? { setupId: grant.setupId } : {}),
                });
            }
        }
        res.status(204).end();
    });
}
