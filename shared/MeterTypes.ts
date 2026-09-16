import type { UsageEvent, UsageMeasures } from "./UsageTypes.js";

/**
 * Protocol between the server and the footprint meter screen (docs/ai-footprint-meter.md).
 *
 * The meter loads a snapshot of summed raw usage over HTTP, then adds each usage event the
 * server pushes on the `/meter` socket namespace. Footprints are computed on the screen from
 * raw usage (shared/footprint/ecologits.ts), never sent.
 */

export const METER_NAMESPACE = "/meter";
export const METER_USAGE_EVENT = "usage";
export const METER_ROOM_POWER_EVENT = "room-power";

/** Summed raw usage of one model within a scope. */
export interface UsageTotalsRow {
    provider: string;
    model: string;
    requests: number;
    measures: UsageMeasures;
}

/** `GET /api/meter?installation=<id>` */
export interface MeterSnapshot {
    /** Every council, everywhere. */
    global: UsageTotalsRow[];
    /** The requested installation, empty without one. */
    installation: UsageTotalsRow[];
    /** The installation's most recent meeting, if it has had one. */
    meeting: { meetingId: number; totals: UsageTotalsRow[] } | null;
    /** The installation's room electricity, one entry per plug. */
    room: RoomPowerReading[];
}

/**
 * `POST /api/room-power`, sent every few seconds by each smart plug in an installation
 * (scripts/shelly/room-power.js), authorised by `X-Room-Power-Key`.
 */
export interface RoomPowerReport {
    installationId: string;
    /** Stable per plug, e.g. the Shelly device id. */
    deviceId: string;
    /** What is plugged in, as shown on the meter: "Projector". */
    label: string;
    /** Instantaneous power, W. */
    watts: number;
    /** The plug's own lifetime energy counter, Wh. Resets when the plug does. */
    energyCounterWh: number;
}

/** The latest state of one plug. Also pushed on `room-power`. */
export interface RoomPowerReading {
    installationId: string;
    deviceId: string;
    label: string;
    watts: number;
    /** Energy since the server first heard from this plug, Wh, surviving plug counter resets. */
    energyWh: number;
    /** ISO time of the latest report. */
    updatedAt: string;
}

/** Pushed to every meter as usage is recorded. `ts` arrives as an ISO string. */
export type MeterUsageEvent = Omit<UsageEvent, "ts"> & { ts: string };
