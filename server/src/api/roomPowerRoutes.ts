import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";

import { config } from "@root/src/config.js";
import { recordRoomPower } from "@services/RoomPowerService.js";
import { Logger } from "@utils/Logger.js";

/**
 * Smart plugs in an installation report the room's electricity here every few seconds
 * (scripts/shelly/room-power.js). The key lives in each plug's script, readable by anyone on
 * the museum network, so it is separate from the bridge key and can only report power.
 */

export const ROOM_POWER_KEY_HEADER = "x-room-power-key";

const Id = z.string().trim().min(1).max(64);

export const RoomPowerReportBody = z.object({
    installationId: Id,
    deviceId: Id,
    label: z.string().trim().min(1).max(64),
    watts: z.number().min(0).max(10_000),
    energyCounterWh: z.number().min(0).max(1e9),
});

function digest(value: string): Buffer {
    return createHash("sha256").update(value).digest();
}

export function registerRoomPowerRoutes(app: Express): void {
    app.post("/api/room-power", async (req: Request, res: Response) => {
        const expected = config.COUNCIL_ROOM_POWER_KEY;
        if (!expected) {
            res.status(503).json({ message: "Room power is not configured" });
            return;
        }
        // Hashing first gives equal-length buffers, so the comparison leaks nothing about length.
        if (!timingSafeEqual(digest(req.get(ROOM_POWER_KEY_HEADER) ?? ""), digest(expected))) {
            res.status(401).json({ message: "Invalid room power key" });
            return;
        }

        const parsed = RoomPowerReportBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "Invalid room power report" });
            return;
        }

        try {
            await recordRoomPower(parsed.data);
            res.status(204).end();
        } catch (error) {
            await Logger.error("api", "POST /api/room-power failed", { error });
            res.status(500).json({ message: "Could not record room power" });
        }
    });
}
