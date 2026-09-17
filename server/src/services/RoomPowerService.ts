import type { StoredRoomPower } from "@models/DBModels.js";
import type { RoomPowerReading, RoomPowerReport } from "@shared/MeterTypes.js";

import { roomPowerCollection } from "@services/DbService.js";
import { Logger } from "@utils/Logger.js";

/**
 * The electricity of the room an installation runs in, measured by smart plugs (docs/ai-footprint-meter.md).
 * Keeps the latest reading per plug and accumulates energy from each plug's own counter.
 */

type RoomPowerListener = (reading: RoomPowerReading) => void;
const listeners = new Set<RoomPowerListener>();

/** Subscribe to new plug readings (the live meter). Returns an unsubscribe function. */
export function onRoomPowerRecorded(listener: RoomPowerListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function toReading(doc: StoredRoomPower): RoomPowerReading {
    return {
        venueId: doc.venueId,
        deviceId: doc.deviceId,
        label: doc.label,
        watts: doc.watts,
        energyWh: doc.energyWh,
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/**
 * Stores one plug report. Energy grows by how far the plug's counter moved since its last
 * report; a counter that went backwards means the plug reset, so all of its new count is added.
 * One atomic update, so overlapping reports cannot double count.
 */
export async function recordRoomPower(report: RoomPowerReport, now: Date = new Date()): Promise<RoomPowerReading | null> {
    const collection = roomPowerCollection;
    if (!collection) return null;

    const counter = report.energyCounterWh;
    const doc = await collection.findOneAndUpdate(
        { _id: `${report.venueId}|${report.deviceId}` },
        [{
            $set: {
                venueId: { $literal: report.venueId },
                deviceId: { $literal: report.deviceId },
                label: { $literal: report.label },
                watts: { $literal: report.watts },
                updatedAt: { $literal: now },
                energyWh: {
                    $cond: [
                        { $eq: [{ $type: "$lastCounterWh" }, "missing"] },
                        0,
                        {
                            $add: [
                                "$energyWh",
                                { $cond: [{ $gte: [counter, "$lastCounterWh"] }, { $subtract: [counter, "$lastCounterWh"] }, counter] },
                            ],
                        },
                    ],
                },
                lastCounterWh: { $literal: counter },
            },
        }],
        { upsert: true, returnDocument: "after" },
    );
    if (!doc) return null;

    const reading = toReading(doc);
    for (const listener of listeners) {
        try {
            listener(reading);
        } catch (error) {
            void Logger.warn("room-power", "Room power listener failed", { error });
        }
    }
    return reading;
}

export async function getRoomPower(venueId: string): Promise<RoomPowerReading[]> {
    const collection = roomPowerCollection;
    if (!collection) return [];
    const docs = await collection.find({ venueId }).sort({ label: 1 }).toArray();
    return docs.map(toReading);
}
