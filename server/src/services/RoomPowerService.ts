import { MongoServerError } from "mongodb";
import type { StoredRoomPower } from "@models/DBModels.js";
import { ROOM_POWER_SILENT_MS, type RoomPowerReading, type RoomPowerReport } from "@shared/MeterTypes.js";

import { roomPowerCollection, roomPowerHoursCollection } from "@services/DbService.js";
import { meterEvents } from "@services/meterEvents.js";
import { Logger } from "@utils/Logger.js";

/**
 * The electricity of the room an installation runs in, measured by smart plugs (docs/ai-footprint-meter.md).
 * Keeps the latest reading per plug, accumulates energy from each plug's own counter, and
 * keeps each plug's energy per hour in `room_power_hours`. Everything is stored under the
 * venue the plug was at when it reported, so moving plugs never carries energy along.
 */

/** A plug's report, placed by the venue list: where the plug is now and what it powers. */
export type PlacedRoomPowerReport = RoomPowerReport & { venueId: string; label: string };

export type RecordRoomPowerResult =
    | { reading: RoomPowerReading }
    /** Another Shelly is reporting as this plug number: two plugs were given the same number. */
    | { numberTakenBy: string };

const DUPLICATE_KEY = 11000;

function toReading(doc: StoredRoomPower): RoomPowerReading {
    return {
        venueId: doc.venueId,
        plug: doc.plug,
        label: doc.label,
        watts: doc.watts,
        energyWh: doc.energyWh,
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/**
 * Stores one plug report. Energy grows by how far the plug's counter moved since its last
 * report; a counter that went backwards means the plug reset, so all of its new count is added.
 * One atomic update, so overlapping reports cannot double count. What the report added also
 * goes into the plug's hour, the history kept for later questions (from a date, per day).
 *
 * A plug number belongs to the Shelly that last reported as it until that one falls silent,
 * so a replacement plug takes over by itself, starting from its own counter, but two plugs
 * with the same number never mix.
 */
export async function recordRoomPower(report: PlacedRoomPowerReport, now: Date = new Date()): Promise<RecordRoomPowerResult | null> {
    const collection = roomPowerCollection;
    if (!collection) return null;

    const _id = `${report.venueId}|${report.plug}`;
    const counter = report.energyCounterWh;
    let doc: StoredRoomPower | null;
    try {
        doc = await collection.findOneAndUpdate(
            // Held by another, still reporting Shelly: nothing matches, and the upsert's insert
            // then collides on _id instead of taking the number over.
            {
                _id,
                $or: [
                    { deviceId: report.deviceId },
                    { updatedAt: { $lt: new Date(now.getTime() - ROOM_POWER_SILENT_MS) } },
                ],
            },
            [
                {
                    $set: {
                        lastDeltaWh: {
                            $cond: [
                                // First sight of this Shelly as this number: its counter is only a baseline.
                                { $or: [{ $eq: [{ $type: "$lastCounterWh" }, "missing"] }, { $ne: ["$deviceId", report.deviceId] }] },
                                0,
                                { $cond: [{ $gte: [counter, "$lastCounterWh"] }, { $subtract: [counter, "$lastCounterWh"] }, counter] },
                            ],
                        },
                    },
                },
                {
                    $set: {
                        venueId: { $literal: report.venueId },
                        plug: { $literal: report.plug },
                        deviceId: { $literal: report.deviceId },
                        label: { $literal: report.label },
                        watts: { $literal: report.watts },
                        updatedAt: { $literal: now },
                        energyWh: { $add: [{ $ifNull: ["$energyWh", 0] }, "$lastDeltaWh"] },
                        lastCounterWh: { $literal: counter },
                    },
                },
            ],
            { upsert: true, returnDocument: "after" },
        );
    } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) throw error;
        const holder = await collection.findOne({ _id });
        if (!holder) throw error;
        return { numberTakenBy: holder.deviceId };
    }
    if (!doc) return null;

    const reading = toReading(doc);
    meterEvents.emit("roomPower", reading);
    await recordHour(doc, now);
    return { reading };
}

/** Adds a report to its plug's hour. History is a side record: failing it never fails the report. */
async function recordHour(doc: StoredRoomPower, now: Date): Promise<void> {
    const hours = roomPowerHoursCollection;
    if (!hours) return;

    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    try {
        await hours.updateOne(
            { _id: `${doc.venueId}|${doc.plug}|${hour.toISOString()}` },
            {
                $setOnInsert: { venueId: doc.venueId, plug: doc.plug, hour },
                $set: { label: doc.label, deviceId: doc.deviceId },
                $inc: { energyWh: doc.lastDeltaWh, reports: 1 },
                $max: { maxWatts: doc.watts },
            },
            { upsert: true },
        );
    } catch (error) {
        void Logger.warn("room-power", `Failed to record the hour of plug ${doc.plug} at ${doc.venueId}`, { error });
    }
}

export async function getRoomPower(venueId: string): Promise<RoomPowerReading[]> {
    const collection = roomPowerCollection;
    if (!collection) return [];
    const docs = await collection.find({ venueId }).sort({ plug: 1 }).toArray();
    return docs.map(toReading);
}
