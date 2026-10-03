import path from "node:path";
import type { Express, Request, Response } from "express";
import type { Server } from "socket.io";

import {
    METER_NAMESPACE,
    METER_PAGE_PATHS,
    METER_PROGRESS_EVENT,
    METER_ROOM_POWER_EVENT,
    METER_SETUP_EVENT,
    METER_USAGE_EVENT,
    type MeetingProgress,
    type MeterMeeting,
    type MeterSnapshot,
    type MeterUsageEvent,
    type RoomPowerReading,
    type SetupStarted,
    type UsageTotalsRow,
} from "@shared/MeterTypes.js";
import type { UsageEvent } from "@shared/UsageTypes.js";
import { meetingsCollection, usageEventsCollection } from "@services/DbService.js";
import { getUsageTotals } from "@services/UsageService.js";
import { getRoomPower } from "@services/RoomPowerService.js";
import { meterEvents } from "@services/meterEvents.js";
import { InternalServerError } from "@models/Errors.js";
import { Logger } from "@utils/Logger.js";
import { CACHE_CONTROL_NO_STORE } from "@utils/httpCache.js";
import { findVenue, resolveVenueId } from "@utils/venues.js";
import { latestOpenSetup } from "./realtimeUsage.js";

/**
 * The footprint meter screen (docs/ai-footprint-meter.md): a snapshot over HTTP, then every
 * recorded usage pushed live on the `/meter` namespace. Usage totals are not sensitive, so
 * neither needs authentication.
 */

/** A meeting's latest sign of life: its latest usage, or when it began if it has used nothing yet. */
function lastActiveAt(totals: UsageTotalsRow[], startedAt: number): string {
    const latest = Math.max(startedAt, ...totals.map((row) => Date.parse(row.lastUsedAt)));
    return new Date(latest).toISOString();
}

/**
 * The venue's current meeting: a visitor's setup still in progress, once it is newer than the
 * latest meeting, or else that meeting.
 */
async function currentMeeting(venueId: string): Promise<MeterMeeting | null> {
    const latestMeeting = await meetingsCollection.findOne(
        { venueId },
        { sort: { _id: -1 }, projection: { _id: 1, maximumPlayedIndex: 1, date: 1 } },
    );
    // The setup now open, or after a restart, the newest whose usage has no meeting yet.
    const open = latestOpenSetup(venueId);
    const recorded = open ? null : await usageEventsCollection?.findOne(
        { venueId, setupId: { $exists: true }, meetingId: { $exists: false } },
        { sort: { ts: -1 }, projection: { setupId: 1, ts: 1 } },
    );
    const setup = open ?? (recorded?.setupId ? { setupId: recorded.setupId, startedAt: recorded.ts.getTime() } : undefined);

    if (setup && (!latestMeeting || setup.startedAt > new Date(latestMeeting.date).getTime())) {
        const totals = await getUsageTotals({ setupId: setup.setupId });
        return {
            meetingId: null,
            setupId: setup.setupId,
            ...(latestMeeting ? { previousMeetingId: latestMeeting._id } : {}),
            maximumPlayedIndex: -1,
            totals,
            lastActiveAt: lastActiveAt(totals, setup.startedAt),
        };
    }
    if (!latestMeeting) return null;
    const totals = await getUsageTotals({ meetingId: latestMeeting._id }, { byMessage: true });
    return {
        meetingId: latestMeeting._id,
        maximumPlayedIndex: latestMeeting.maximumPlayedIndex ?? -1,
        totals,
        lastActiveAt: lastActiveAt(totals, new Date(latestMeeting.date).getTime()),
    };
}

export async function getMeterSnapshot(venueId: string | undefined): Promise<MeterSnapshot> {
    const [global, venue, meeting, room] = await Promise.all([
        getUsageTotals(),
        venueId ? getUsageTotals({ venueId }) : Promise.resolve([]),
        venueId ? currentMeeting(venueId) : Promise.resolve(null),
        venueId ? getRoomPower(venueId) : Promise.resolve([]),
    ]);

    return {
        global,
        venue,
        venueName: venueId ? findVenue(venueId)?.name ?? venueId : null,
        meeting,
        room,
    };
}

/** The meter's own page and bundle (client/dist/meter.html), outside the council app's language routing. */
export function registerMeterPage(app: Express, clientDistPath: string): void {
    app.get(METER_PAGE_PATHS, (_req: Request, res: Response) => {
        res.setHeader("Cache-Control", CACHE_CONTROL_NO_STORE);
        res.sendFile(path.join(clientDistPath, "meter.html"));
    });
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
    const onUsage = (event: UsageEvent) => {
        const payload: MeterUsageEvent = { ...event, ts: event.ts.toISOString() };
        meters.emit(METER_USAGE_EVENT, payload);
    };
    const onRoomPower = (reading: RoomPowerReading) => meters.emit(METER_ROOM_POWER_EVENT, reading);
    const onProgress = (progress: MeetingProgress) => meters.emit(METER_PROGRESS_EVENT, progress);
    const onSetup = (setup: SetupStarted) => meters.emit(METER_SETUP_EVENT, setup);
    meterEvents.on("usage", onUsage);
    meterEvents.on("roomPower", onRoomPower);
    meterEvents.on("meetingProgress", onProgress);
    meterEvents.on("setupStarted", onSetup);
    return () => {
        meterEvents.off("usage", onUsage);
        meterEvents.off("roomPower", onRoomPower);
        meterEvents.off("meetingProgress", onProgress);
        meterEvents.off("setupStarted", onSetup);
    };
}
