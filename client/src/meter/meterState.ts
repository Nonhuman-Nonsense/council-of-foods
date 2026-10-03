import { ROOM_POWER_SILENT_MS, type MeterSnapshot, type MeterUsageEvent, type RoomPowerReading, type UsageTotalsRow } from "@shared/MeterTypes";
import type { UsageMeasures } from "@shared/UsageTypes";
import {
  estimateGpuSeconds,
  estimateImpacts,
  findEcologitsModel,
  IMPACTS,
  type Impact,
  type ImpactRange,
  type Impacts,
} from "@shared/footprint/ecologits";

/**
 * Pure state of the footprint meter: summed raw usage per scope, and the footprint derived
 * from it. The server sends a snapshot, then usage events; this folds them together.
 */

export type MeterState = MeterSnapshot;

export const EMPTY_METER_STATE: MeterState = { global: [], venue: [], venueName: null, meeting: null, room: [] };

function addToRows(rows: UsageTotalsRow[], event: MeterUsageEvent): UsageTotalsRow[] {
  const index = rows.findIndex((row) => row.provider === event.provider && row.model === event.model);
  const existing = index >= 0 ? rows[index] : { provider: event.provider, model: event.model, requests: 0, measures: {} };
  const measures: UsageMeasures = { ...existing.measures };
  for (const [measure, value] of Object.entries(event.measures) as [keyof UsageMeasures, number][]) {
    measures[measure] = (measures[measure] ?? 0) + value;
  }
  const updated = { ...existing, requests: existing.requests + 1, measures };
  return index >= 0 ? rows.map((row, i) => (i === index ? updated : row)) : [...rows, updated];
}

/**
 * Adds one usage event. Everything counts globally; the venue and its current meeting only
 * count their own. A newer meeting at the venue replaces the current one.
 */
export function applyUsageEvent(state: MeterState, event: MeterUsageEvent, venueId: string | undefined): MeterState {
  const global = addToRows(state.global, event);
  if (!venueId || event.venueId !== venueId) {
    return { ...state, global };
  }

  const venue = addToRows(state.venue, event);
  let meeting = state.meeting;
  if (event.meetingId !== undefined) {
    if (!meeting || event.meetingId > meeting.meetingId) {
      meeting = { meetingId: event.meetingId, totals: addToRows([], event) };
    } else if (event.meetingId === meeting.meetingId) {
      meeting = { ...meeting, totals: addToRows(meeting.totals, event) };
    }
  }
  return { ...state, global, venue, meeting };
}

/** Replaces a plug's reading, if the plug is at this venue. */
export function applyRoomPower(state: MeterState, reading: RoomPowerReading, venueId: string | undefined): MeterState {
  if (!venueId || reading.venueId !== venueId) return state;
  const others = state.room.filter((r) => r.plug !== reading.plug);
  return { ...state, room: [...others, reading].sort((a, b) => a.plug - b.plug) };
}

export interface RoomFootprint {
  /** Watts now, from the plugs that are reporting. */
  watts: number;
  /** Energy since each plug was first heard, Wh, silent plugs included: it was used. */
  energyWh: number;
  /** The plugs that are reporting, not silent for `ROOM_POWER_SILENT_MS`. */
  plugs: RoomPowerReading[];
}

export function roomFootprintOf(readings: RoomPowerReading[], now: number): RoomFootprint {
  const plugs = readings.filter((r) => now - Date.parse(r.updatedAt) <= ROOM_POWER_SILENT_MS);
  return {
    watts: plugs.reduce((sum, p) => sum + p.watts, 0),
    energyWh: readings.reduce((sum, r) => sum + r.energyWh, 0),
    plugs,
  };
}

/** The estimated footprint of a scope's usage. Models without an estimate count as nothing. */
export function footprintOf(rows: UsageTotalsRow[]): Impacts {
  return sumOver(rows, () => true);
}

function sumOver(rows: UsageTotalsRow[], include: (basis: string) => boolean): Impacts {
  const impacts = Object.fromEntries(IMPACTS.map((impact) => [impact, { low: 0, high: 0 }])) as Impacts;
  for (const row of rows) {
    const model = findEcologitsModel(row.provider, row.model);
    if (!model || !include(model.basis)) continue;
    const rowImpacts = estimateImpacts(model, { measures: row.measures, requests: row.requests });
    for (const impact of IMPACTS) {
      impacts[impact].low += rowImpacts[impact].low;
      impacts[impact].high += rowImpacts[impact].high;
    }
  }
  return impacts;
}

/**
 * How much of the estimated energy rests on models nobody has described (basis "guessed"), as
 * a share at each end of the range. Null before there is anything to share.
 */
export function guessedShareOf(rows: UsageTotalsRow[]): ImpactRange | null {
  const all = footprintOf(rows).energy;
  const guessed = sumOver(rows, (basis) => basis === "guessed").energy;
  if (all.low <= 0 || all.high <= 0) return null;
  const atLow = guessed.low / all.low;
  const atHigh = guessed.high / all.high;
  return { low: Math.min(atLow, atHigh), high: Math.max(atLow, atHigh) };
}

/** GPU time the usage occupied, in seconds of one whole GPU: what the hardware's minerals are divided by. */
export function gpuTimeOf(rows: UsageTotalsRow[]): ImpactRange {
  const total = { low: 0, high: 0 };
  for (const row of rows) {
    const model = findEcologitsModel(row.provider, row.model);
    if (!model) continue;
    const seconds = estimateGpuSeconds(model, { measures: row.measures, requests: row.requests });
    total.low += seconds.low;
    total.high += seconds.high;
  }
  return total;
}

export interface Counted {
  /** Replies the writing models produced, retries included. */
  replies: number;
  /** Seconds of speech the voices produced. */
  spokenSeconds: number;
  /** Seconds of the visitors' speech the models listened to. */
  listenedSeconds: number;
}

/** What the providers bill for, exactly: no estimate involved. */
export function countedOf(rows: UsageTotalsRow[]): Counted {
  const counted: Counted = { replies: 0, spokenSeconds: 0, listenedSeconds: 0 };
  for (const row of rows) {
    const role = findEcologitsModel(row.provider, row.model)?.role;
    if (role === "writing") counted.replies += row.requests;
    if (role === "speaking") counted.spokenSeconds += row.measures.audio_seconds ?? 0;
    if (role === "listening") counted.listenedSeconds += row.measures.audio_seconds ?? 0;
  }
  return counted;
}

interface UnitStep {
  unit: string;
  /** Multiplier from the base unit into this one. */
  factor: number;
}

/** From smallest to largest; EcoLogits' units are kWh, kgCO2eq, kgSbeq and L. */
const UNIT_LADDERS: Record<Impact | "gpuTime", UnitStep[]> = {
  energy: [{ unit: "Wh", factor: 1e3 }, { unit: "kWh", factor: 1 }, { unit: "MWh", factor: 1e-3 }],
  wcf: [{ unit: "mL", factor: 1e3 }, { unit: "L", factor: 1 }, { unit: "m³", factor: 1e-3 }],
  gwp: [{ unit: "mg CO₂e", factor: 1e6 }, { unit: "g CO₂e", factor: 1e3 }, { unit: "kg CO₂e", factor: 1 }, { unit: "t CO₂e", factor: 1e-3 }],
  adpe: [{ unit: "µg Sb eq", factor: 1e9 }, { unit: "mg Sb eq", factor: 1e6 }, { unit: "g Sb eq", factor: 1e3 }, { unit: "kg Sb eq", factor: 1 }],
  gpuTime: [
    { unit: "GPU-seconds", factor: 1 },
    { unit: "GPU-minutes", factor: 1 / 60 },
    { unit: "GPU-hours", factor: 1 / 3600 },
    { unit: "GPU-days", factor: 1 / 86_400 },
  ],
};

/** A range in one readable unit. There is no midpoint: the ends are bounds, not a distribution. */
export interface DisplayRange {
  low: number;
  high: number;
  unit: string;
}

/** Picks the largest unit in which the high end is at least 1, so numbers stay readable as they grow. */
export function toDisplayRange(quantity: Impact | "gpuTime", range: ImpactRange): DisplayRange {
  const ladder = UNIT_LADDERS[quantity];
  const step = [...ladder].reverse().find((s) => range.high * s.factor >= 1) ?? ladder[0];
  return { low: range.low * step.factor, high: range.high * step.factor, unit: step.unit };
}

/**
 * A value rounded to `digits` significant figures, and the decimals that takes. Estimates get
 * two: they should not show more digits than they have. Published figures can keep three.
 */
export function significant(value: number, digits = 2): { value: number; fractionDigits: number } {
  if (value === 0 || !Number.isFinite(value)) return { value: 0, fractionDigits: 0 };
  return {
    value: Number(value.toPrecision(digits)),
    fractionDigits: Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(value)))),
  };
}

/** "0.61–1.2 Wh", or "45 mL" when both ends agree at that precision. */
export function formatRange(range: DisplayRange, digits = 2): string {
  const format = (v: number) => {
    const { value, fractionDigits } = significant(v, digits);
    return value.toLocaleString("en", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  };
  const low = format(range.low);
  const high = format(range.high);
  return low === high ? `${low} ${range.unit}` : `${low}–${high} ${range.unit}`;
}
