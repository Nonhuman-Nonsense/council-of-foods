import type { MeterSnapshot, MeterUsageEvent, UsageTotalsRow } from "@shared/MeterTypes";
import type { UsageMeasures } from "@shared/UsageTypes";
import {
  estimateImpacts,
  findEcologitsModel,
  IMPACTS,
  type Impact,
  type Impacts,
} from "@shared/footprint/ecologits";

/**
 * Pure state of the footprint meter: summed raw usage per scope, and the footprint derived
 * from it. The server sends a snapshot, then usage events; this folds them together.
 */

export type MeterState = MeterSnapshot;

export const EMPTY_METER_STATE: MeterState = { global: [], installation: [], meeting: null };

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
 * Adds one usage event. Everything counts globally; the installation and its current meeting
 * only count their own. A newer meeting at the installation replaces the current one.
 */
export function applyUsageEvent(state: MeterState, event: MeterUsageEvent, installationId: string | undefined): MeterState {
  const global = addToRows(state.global, event);
  if (!installationId || event.installationId !== installationId) {
    return { ...state, global };
  }

  const installation = addToRows(state.installation, event);
  let meeting = state.meeting;
  if (event.meetingId !== undefined) {
    if (!meeting || event.meetingId > meeting.meetingId) {
      meeting = { meetingId: event.meetingId, totals: addToRows([], event) };
    } else if (event.meetingId === meeting.meetingId) {
      meeting = { ...meeting, totals: addToRows(meeting.totals, event) };
    }
  }
  return { global, installation, meeting };
}

export interface ScopeFootprint {
  impacts: Impacts;
  requests: number;
  /** Models used in this scope that the footprint table has no estimate for. */
  unestimatedModels: string[];
}

export function footprintOf(rows: UsageTotalsRow[]): ScopeFootprint {
  const impacts = Object.fromEntries(IMPACTS.map((impact) => [impact, { low: 0, high: 0 }])) as Impacts;
  const unestimatedModels: string[] = [];
  let requests = 0;

  for (const row of rows) {
    requests += row.requests;
    const model = findEcologitsModel(row.provider, row.model);
    if (!model) {
      unestimatedModels.push(row.model);
      continue;
    }
    const rowImpacts = estimateImpacts(model, { measures: row.measures, requests: row.requests });
    for (const impact of IMPACTS) {
      impacts[impact].low += rowImpacts[impact].low;
      impacts[impact].high += rowImpacts[impact].high;
    }
  }
  return { impacts, requests, unestimatedModels };
}

interface UnitStep {
  unit: string;
  /** Multiplier from EcoLogits' unit into this one. */
  factor: number;
}

/** From smallest to largest; EcoLogits' units are kWh, kgCO2eq, kgSbeq and L. */
const UNIT_LADDERS: Record<Exclude<Impact, "pe">, UnitStep[]> = {
  energy: [{ unit: "Wh", factor: 1e3 }, { unit: "kWh", factor: 1 }, { unit: "MWh", factor: 1e-3 }],
  wcf: [{ unit: "mL", factor: 1e3 }, { unit: "L", factor: 1 }, { unit: "m³", factor: 1e-3 }],
  gwp: [{ unit: "mg CO₂e", factor: 1e6 }, { unit: "g CO₂e", factor: 1e3 }, { unit: "kg CO₂e", factor: 1 }, { unit: "t CO₂e", factor: 1e-3 }],
  adpe: [{ unit: "µg Sb eq", factor: 1e9 }, { unit: "mg Sb eq", factor: 1e6 }, { unit: "g Sb eq", factor: 1e3 }, { unit: "kg Sb eq", factor: 1 }],
};

export interface DisplayRange {
  low: number;
  high: number;
  /** Midpoint, the number shown large. */
  central: number;
  unit: string;
}

/** Picks the largest unit in which the midpoint is at least 1, so numbers stay readable as they grow. */
export function toDisplayRange(impact: Exclude<Impact, "pe">, range: { low: number; high: number }): DisplayRange {
  const central = (range.low + range.high) / 2;
  const ladder = UNIT_LADDERS[impact];
  const step = [...ladder].reverse().find((s) => central * s.factor >= 1) ?? ladder[0];
  return {
    low: range.low * step.factor,
    high: range.high * step.factor,
    central: central * step.factor,
    unit: step.unit,
  };
}
