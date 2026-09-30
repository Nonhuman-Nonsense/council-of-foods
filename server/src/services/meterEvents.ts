import { EventEmitter } from "node:events";
import type { RoomPowerReading } from "@shared/MeterTypes.js";
import type { UsageEvent } from "@shared/UsageTypes.js";

/** What the footprint meter follows live: every recorded AI usage and every plug reading. */
export const meterEvents = new EventEmitter<{
    usage: [UsageEvent];
    roomPower: [RoomPowerReading];
}>();
