import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { config } from "@root/src/config.js";
import { maskEmail, type Venue } from "@models/Venues.js";
import { getSender, isMailConfigured, sendEmail } from "@services/MailService.js";
import { sendReport } from "@utils/errorbot.js";
import { PrinterAlertBody, buildPrinterAlertEmail, describeReason } from "./printerAlerts.js";

/**
 * Endpoints for installation bridges (the local daemon on a museum Mac). Only
 * bridges holding COUNCIL_BRIDGE_KEY may call them, and alerts only ever go to
 * the addresses configured for a venue.
 */

export const BRIDGE_KEY_HEADER = "x-bridge-key";

/** Per venue. Bridges send a handful a day; this only stops a runaway loop. */
const ALERTS_PER_HOUR = 12;
const HOUR_MS = 60 * 60 * 1000;
const sentAt = new Map<string, number[]>();

/** Test hook. */
export function _resetBridgeRateLimitsForTests(): void {
    sentAt.clear();
}

function takeRateLimitSlot(venueId: string, now = Date.now()): boolean {
    const recent = (sentAt.get(venueId) ?? []).filter((time) => now - time < HOUR_MS);
    if (recent.length >= ALERTS_PER_HOUR) {
        sentAt.set(venueId, recent);
        return false;
    }
    recent.push(now);
    sentAt.set(venueId, recent);
    return true;
}

function digest(value: string): Buffer {
    return createHash("sha256").update(value).digest();
}

function requireBridge(req: Request, res: Response, next: NextFunction): void {
    const expected = config.COUNCIL_BRIDGE_KEY;
    if (!expected || !config.COUNCIL_VENUES?.length) {
        res.status(503).json({ message: "Bridge endpoints are not configured" });
        return;
    }
    const provided = req.get(BRIDGE_KEY_HEADER) ?? "";
    // Hashing first gives equal-length buffers, so the comparison leaks nothing about length.
    if (!timingSafeEqual(digest(provided), digest(expected))) {
        res.status(401).json({ message: "Invalid bridge key" });
        return;
    }
    next();
}

function findVenue(id: string): Venue | undefined {
    return config.COUNCIL_VENUES?.find((venue) => venue.id === id);
}

export function registerBridgeRoutes(app: Express): void {
    app.get("/api/bridge/venues", requireBridge, (_req: Request, res: Response) => {
        res.json({
            venues: (config.COUNCIL_VENUES ?? []).map((venue) => ({
                id: venue.id,
                name: venue.name,
                recipients: venue.alertEmails.map(maskEmail),
                timezone: venue.timezone,
                openingHours: venue.openingHours,
            })),
        });
    });

    app.post("/api/bridge/printer-alerts", requireBridge, async (req: Request, res: Response) => {
        const parsed = PrinterAlertBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid printer alert" });
            return;
        }
        const alert = parsed.data;
        const venue = findVenue(alert.venueId);
        if (!venue) {
            res.status(400).json({ message: `Unknown venue: ${alert.venueId}` });
            return;
        }
        if (!isMailConfigured()) {
            res.status(503).json({ message: "Email is not configured" });
            return;
        }
        if (!takeRateLimitSlot(venue.id)) {
            res.status(429).json({ message: "Too many alerts for this venue" });
            return;
        }

        const email = buildPrinterAlertEmail(getSender().name, venue, alert);

        // The team's copy. Sent before the email, so a failing send is still seen.
        await sendReport({
            context: `printer ${venue.id}`,
            severity: "warning",
            source: "server",
            message: `[PRINTER ${alert.kind.toUpperCase()}] ${venue.name}: ${
                alert.kind === "resolved" ? "working again" : describeReason(alert.reason)
            }${alert.waiting !== undefined ? ` (${alert.waiting} waiting)` : ""}${alert.host ? ` · ${alert.host}` : ""}`,
        });

        try {
            await sendEmail(email);
        } catch (error) {
            await sendReport({
                context: `printer ${venue.id}`,
                severity: "error",
                source: "server",
                message: `Could not email printer alert to ${venue.name}`,
                error,
            });
            res.status(502).json({ message: "Could not send email" });
            return;
        }

        res.json({ ok: true });
    });
}
