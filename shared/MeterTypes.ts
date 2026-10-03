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
export const METER_PROGRESS_EVENT = "meeting-progress";

/** Summed raw usage of one model within a scope. */
export interface UsageTotalsRow {
    provider: string;
    model: string;
    requests: number;
    measures: UsageMeasures;
    /** ISO time the model was last called in this scope. */
    lastUsedAt: string;
    /**
     * In a meeting's totals: the message the usage was for (rows are per model and message), or
     * absent for live usage that counts at once.
     */
    messageIndex?: number;
}

/** A meeting's playback, pushed on `meeting-progress` as the visitor's screen moves on. */
export interface MeetingProgress {
    meetingId: number;
    venueId?: string;
    /** The furthest message the visitor has been shown; its usage, and all before, has been seen. */
    maximumPlayedIndex: number;
}

/** `GET /api/meter?venue=<id>` */
export interface MeterSnapshot {
    /** Every council, everywhere. */
    global: UsageTotalsRow[];
    /** The requested venue, empty without one. */
    venue: UsageTotalsRow[];
    /** The venue's display name, if one was requested. */
    venueName: string | null;
    /** The venue's most recent meeting, if it has had one: usage per model and message. */
    meeting: { meetingId: number; maximumPlayedIndex: number; totals: UsageTotalsRow[] } | null;
    /** The venue's room electricity, one entry per plug. */
    room: RoomPowerReading[];
}

/**
 * A plug that has not reported for this long is silent: left off the meter, and its number free
 * for another plug. Plugs report every 5 s, so this is a few missed reports, not one late one.
 */
export const ROOM_POWER_SILENT_MS = 20_000;

/**
 * `POST /api/installation/room-power`, sent every few seconds by each smart plug
 * (scripts/shelly/room-power.js), authorised by `X-Installation-Key`. The plug knows only its
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
