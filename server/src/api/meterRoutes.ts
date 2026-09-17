import type { Express, Request, Response } from "express";
import type { Server } from "socket.io";

import {
    METER_NAMESPACE,
    METER_ROOM_POWER_EVENT,
    METER_USAGE_EVENT,
    type MeterSnapshot,
    type MeterUsageEvent,
} from "@shared/MeterTypes.js";
import { meetingsCollection } from "@services/DbService.js";
import {
    getMeetingUsageTotals,
    getUsageTotals,
    GLOBAL_USAGE_SCOPE,
    venueUsageScope,
    onUsageRecorded,
} from "@services/UsageService.js";
import { getRoomPower, onRoomPowerRecorded } from "@services/RoomPowerService.js";
import { InternalServerError } from "@models/Errors.js";
import { Logger } from "@utils/Logger.js";
import { findVenue, resolveVenueId } from "@utils/venues.js";

/**
 * The footprint meter screen (docs/ai-footprint-meter.md): a snapshot over HTTP, then every
 * recorded usage pushed live on the `/meter` namespace. Usage totals are not sensitive, so
 * neither needs authentication.
 */

export async function getMeterSnapshot(venueId: string | undefined): Promise<MeterSnapshot> {
    const latestMeeting = venueId
        ? await meetingsCollection.findOne({ venueId }, { sort: { _id: -1 }, projection: { _id: 1 } })
        : null;

    const [global, venue, meetingTotals, room] = await Promise.all([
        getUsageTotals(GLOBAL_USAGE_SCOPE),
        venueId ? getUsageTotals(venueUsageScope(venueId)) : Promise.resolve([]),
        latestMeeting ? getMeetingUsageTotals(latestMeeting._id) : Promise.resolve([]),
        venueId ? getRoomPower(venueId) : Promise.resolve([]),
    ]);

    return {
        global,
        venue,
        venueName: venueId ? findVenue(venueId)?.name ?? venueId : null,
        meeting: latestMeeting ? { meetingId: latestMeeting._id, totals: meetingTotals } : null,
        room,
    };
}

export function registerMeterRoutes(app: Express): void {
    app.get("/api/meter", async (req: Request, res: Response) => {
        try {
            res.status(200).json(await getMeterSnapshot(resolveVenueId(req.query.venue)));
        } catch (error) {
            await Logger.error("api", "GET /api/meter failed", { error });
            res.status(500).json(new InternalServerError().toApiBody("api GET /api/meter"));
        }
    });
}

/**
 * Every meter hears every usage (the global figure needs all of it) and every plug reading;
 * a meter keeps what concerns its venue.
 */
export function registerMeterSocket(io: Server): () => void {
    const meters = io.of(METER_NAMESPACE);
    const stopUsage = onUsageRecorded((event) => {
        const payload: MeterUsageEvent = { ...event, ts: event.ts.toISOString() };
        meters.emit(METER_USAGE_EVENT, payload);
    });
    const stopRoomPower = onRoomPowerRecorded((reading) => {
        meters.emit(METER_ROOM_POWER_EVENT, reading);
    });
    return () => {
        stopUsage();
        stopRoomPower();
    };
}
