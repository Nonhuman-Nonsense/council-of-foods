import NumberFlow from "@number-flow/react";
import type { ReactElement } from "react";
import type { UsageTotalsRow } from "@shared/MeterTypes";
import { ECOLOGITS_VERSION, findEcologitsModel } from "@shared/footprint/ecologits";
import { footprintOf, toDisplayRange, type ScopeFootprint } from "./meterState";
import { useMeterFeed } from "./useMeterFeed";

/**
 * The footprint meter: what the council's AI use costs, live, for a tall side screen
 * (docs/ai-footprint-meter.md). A first version to tune on the real display — copy and
 * layout are expected to change.
 */

const METRICS = [
  { impact: "energy", label: "Energy" },
  { impact: "wcf", label: "Water" },
  { impact: "gwp", label: "Carbon" },
  { impact: "adpe", label: "Minerals" },
] as const;

const ZONE_NAMES: Record<string, string> = {
  USA: "United States",
  SWE: "Sweden",
  NLD: "Netherlands",
  WOR: "somewhere in the world",
};

function Scope({ title, footprint, large }: { title: string; footprint: ScopeFootprint; large?: boolean }): ReactElement {
  return (
    <section className={`meter-scope${large ? " meter-scope--large" : ""}`}>
      <h2>{title}</h2>
      {METRICS.map(({ impact, label }) => {
        const range = toDisplayRange(impact, footprint.impacts[impact]);
        const digits = range.central < 10 ? 2 : range.central < 100 ? 1 : 0;
        return (
          <div className="meter-metric" key={impact}>
            <div className="meter-label">{label}</div>
            <div className="meter-value">
              <NumberFlow value={range.central} format={{ maximumFractionDigits: digits, minimumFractionDigits: digits }} />
              <span className="meter-unit">{range.unit}</span>
            </div>
            {range.high > range.low * 1.001 ? (
              <div className="meter-range">
                {range.low.toPrecision(2)}–{range.high.toPrecision(2)} {range.unit}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function Models({ rows }: { rows: UsageTotalsRow[] }): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <section className="meter-models">
      <h2>Answering now</h2>
      <ul>
        {rows.map((row) => {
          const entry = findEcologitsModel(row.provider, row.model);
          const place = entry ? ZONE_NAMES[entry.datacenterZone] ?? entry.datacenterZone : "unknown";
          return (
            <li key={`${row.provider}|${row.model}`}>
              <span className="meter-model">{row.model}</span>
              <span className="meter-place">{place}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Meter(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const installationId = params.get("installation")?.trim() || undefined;
  const demo = params.has("demo");

  const state = useMeterFeed(installationId, demo);
  const meetingRows = state.meeting?.totals ?? [];

  return (
    <main className="meter">
      {demo ? <div className="meter-demo">DEMO DATA</div> : null}
      {state.meeting ? <Scope title="This meeting" footprint={footprintOf(meetingRows)} large /> : null}
      {installationId || demo ? <Scope title="This installation" footprint={footprintOf(state.installation)} /> : null}
      <Scope title="All councils" footprint={footprintOf(state.global)} />
      <Models rows={meetingRows.length > 0 ? meetingRows : state.installation} />
      <footer className="meter-footer">
        Estimates with EcoLogits {ECOLOGITS_VERSION}. Ranges show how uncertain they are.
      </footer>
    </main>
  );
}
