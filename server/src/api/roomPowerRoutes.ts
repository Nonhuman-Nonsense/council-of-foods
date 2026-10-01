import type { Express, Request, Response } from "express";
import { z } from "zod";

import { recordRoomPower } from "@services/RoomPowerService.js";
import { Logger } from "@utils/Logger.js";
import { findPlug } from "@utils/venues.js";
import { requireInstallationKey } from "./installationKey.js";

/**
 * Smart plugs report the room's electricity here every few seconds
 * (scripts/shelly/room-power.js). A plug sends only its number; `COUNCIL_VENUES` says which
 * venue it is at and what it powers. The plug sends the installation key, pasted into its script.
 */

export const RoomPowerReportBody = z.object({
    plug: z.number().int().positive(),
    deviceId: z.string().trim().min(1).max(64),
    watts: z.number().min(0).max(10_000),
    energyCounterWh: z.number().min(0).max(1e9),
});

export function registerRoomPowerRoutes(app: Express): void {
    app.post("/api/installation/room-power", requireInstallationKey, async (req: Request, res: Response) => {
        const parsed = RoomPowerReportBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid room power report" });
            return;
        }

        // The plug's script prints these messages: they are what whoever sets it up reads.
        const placed = findPlug(parsed.data.plug);
        if (!placed) {
            res.status(404).json({ message: `Plug ${parsed.data.plug} is not at any venue in COUNCIL_VENUES` });
            return;
        }

        try {
            const result = await recordRoomPower({ ...parsed.data, ...placed });
            if (result && "numberTakenBy" in result) {
                res.status(409).json({ message: `Plug ${parsed.data.plug} is already reporting from ${result.numberTakenBy}` });
                return;
            }
            res.status(204).end();
        } catch (error) {
            await Logger.error("api", "POST /api/installation/room-power failed", { error });
            res.status(500).json({ message: "Could not record room power" });
        }
    });
}
