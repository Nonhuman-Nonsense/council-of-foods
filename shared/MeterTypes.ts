import type { UsageEvent, UsageMeasures } from "./UsageTypes.js";

/**
 * Protocol between the server and the footprint meter screen (docs/ai-footprint-meter.md).
 *
 * The meter loads a snapshot of summed raw usage over HTTP, then adds each usage event the
 * server pushes on the `/meter` socket namespace. Footprints are computed on the screen from
 * raw usage (shared/footprint/ecologits.ts), never sent.
 */

/** Page URLs, served by the meter bundle (client/meter.html) in production and in dev. */
export const METER_PAGE_PATH = "/meter";
export const METER_METHODOLOGY_PATH = "/meter/methodology";
export const METER_PAGE_PATHS = [METER_PAGE_PATH, METER_METHODOLOGY_PATH];

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

/** `GET /api/meter?venue=<id>` */
export interface MeterSnapshot {
    /** Every council, everywhere. */
    global: UsageTotalsRow[];
    /** The requested venue, empty without one. */
    venue: UsageTotalsRow[];
    /** The venue's display name, if one was requested. */
    venueName: string | null;
    /** The venue's most recent meeting, if it has had one. */
    meeting: { meetingId: number; totals: UsageTotalsRow[] } | null;
    /** The venue's room electricity, one entry per plug. */
    room: RoomPowerReading[];
}

/**
 * A plug that has not reported for this long is silent: left off the meter, and its number free
 * for another plug. Plugs report every 5 s, so this is a few missed reports, not one late one.
 */
export const ROOM_POWER_SILENT_MS = 20_000;

/**
 * `POST /api/room-power`, sent every few seconds by each smart plug
 * (scripts/shelly/room-power.js), authorised by `X-Room-Power-Key`. The plug knows only its
 * number; which venue it is at, and what it powers, come from `COUNCIL_VENUES`.
 */
export interface RoomPowerReport {
    /** The number marked on the plug, set as its device name. */
    plug: number;
    /** The Shelly's own id, to tell two plugs given the same number apart. */
    deviceId: string;
    /** Instantaneous power, W. */
    watts: number;
    /** The plug's own lifetime energy counter, Wh. Resets when the plug does. */
    energyCounterWh: number;
}

/** The latest state of one plug. Also pushed on `room-power`. */
export interface RoomPowerReading {
    venueId: string;
    plug: number;
    /** What is plugged in, as shown on the meter: "Projector". */
    label: string;
    watts: number;
    /** Energy since the server first heard from this plug at this venue, Wh, surviving plug counter resets. */
    energyWh: number;
    /** ISO time of the latest report. */
    updatedAt: string;
}

/** Pushed to every meter as usage is recorded. `ts` arrives as an ISO string. */
export type MeterUsageEvent = Omit<UsageEvent, "ts"> & { ts: string };
