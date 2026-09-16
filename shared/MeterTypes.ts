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
}

/** Pushed to every meter as usage is recorded. `ts` arrives as an ISO string. */
export type MeterUsageEvent = Omit<UsageEvent, "ts"> & { ts: string };
