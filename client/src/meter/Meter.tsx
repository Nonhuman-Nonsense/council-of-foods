import NumberFlow from "@number-flow/react";
import { QRCodeSVG } from "qrcode.react";
import type { ReactElement } from "react";
import type { UsageTotalsRow } from "@shared/MeterTypes";
import { ECOLOGITS_VERSION, findEcologitsModel } from "@shared/footprint/ecologits";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import { footprintOf, toDisplayRange, type ScopeFootprint } from "./meterState";
import { methodologyUrl, zoneName } from "./modelInfo";
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
          const place = entry ? zoneName(entry.datacenterZone) : "unknown";
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

/** Training is inherited, not caused per meeting: shown whole, and what is undisclosed is named. */
function Training(): ReactElement {
  const disclosed = TRAINING_DISCLOSURES.filter((entry) => entry.disclosed);
  const undisclosed = TRAINING_DISCLOSURES.filter((entry) => !entry.disclosed);
  return (
    <section className="meter-training">
      <h2>Before it could speak</h2>
      {disclosed.map((entry) => {
        const d = entry.disclosed!;
        const values = [
          toDisplayRange("gwp", { low: d.gwpKgCo2e, high: d.gwpKgCo2e }),
          toDisplayRange("wcf", { low: d.waterL, high: d.waterL }),
          toDisplayRange("adpe", { low: d.adpeKgSbEq, high: d.adpeKgSbEq }),
        ];
        return (
          <div key={entry.model}>
            <div className="meter-label">{d.label}</div>
            <div className="meter-training-values">
              {values.map((v) => (
                <div key={v.unit} className="meter-value">
                  {Math.round(v.central).toLocaleString("en")}
                  <span className="meter-unit">{v.unit}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="meter-range">
        Not disclosed: {undisclosed.map((entry) => entry.maker).filter((m, i, all) => all.indexOf(m) === i).join(", ")}
      </div>
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
      <Training />
      <footer className="meter-footer">
        <div>
          Estimates with EcoLogits {ECOLOGITS_VERSION}. Ranges show how uncertain they are. Scan for how they are made.
        </div>
        <QRCodeSVG className="meter-qr" value={methodologyUrl()} bgColor="#000000" fgColor="#f2efe6" marginSize={0} />
      </footer>
    </main>
  );
}
