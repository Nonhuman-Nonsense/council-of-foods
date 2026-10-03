import NumberFlow from "@number-flow/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { RoomPowerReading, UsageTotalsRow } from "@shared/MeterTypes";
import { ECOLOGITS_VERSION, findEcologitsModel } from "@shared/footprint/ecologits";
import { MINERAL_PLACES, NOT_COUNTED, NOT_DISCLOSED } from "@shared/footprint/counting";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import {
  activeModels,
  countedOf,
  footprintOf,
  formatRange,
  gpuTimeOf,
  guessedShareOf,
  playedRows,
  roomFootprintOf,
  toDisplayRange,
  significant,
  type DisplayRange,
} from "./meterState";
import { methodologyUrl, zoneName } from "./modelInfo";
import { useMeterFeed } from "./useMeterFeed";

/**
 * The footprint meter: what the council's AI use costs, live, for a tall side screen
 * (docs/ai-footprint-meter.md). Ordered as a chain of certainty — what is measured here, what
 * is counted, what is estimated or guessed elsewhere, and what nobody counts — with every
 * estimate as a range. Copy and layout are to be tuned on the real display.
 */

type Status = "Measured" | "Counted" | "Estimated";

/** How long each rotating line stays up. */
const ROTATE_MS = 9_000;

/** A titled block; `status` says how its figures are known, when that is not the title itself. */
function Section({ title, status, children, className }: {
  title: string;
  status?: Status;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className={`meter-section${className ? ` ${className}` : ""}`}>
      <h2>
        <span>{title}</span>
        {status ? <span className="meter-status">{status}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** One animated number, at the two significant figures an estimate can carry. */
function Figure({ value }: { value: number }): ReactElement {
  const { value: rounded, fractionDigits } = significant(value);
  return (
    <NumberFlow
      value={rounded}
      format={{ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }}
    />
  );
}

/** A range shown as its two ends: there is no midpoint to show. */
function Range({ range }: { range: DisplayRange }): ReactElement {
  const same = significant(range.low).value === significant(range.high).value;
  return (
    <span className="meter-range-value">
      <Figure value={range.low} />
      {same ? null : (
        <>
          <span className="meter-dash">–</span>
          <Figure value={range.high} />
        </>
      )}
      <span className="meter-unit">{range.unit}</span>
    </span>
  );
}

function Metric({ label, children, note }: { label: string; children: ReactNode; note?: string }): ReactElement {
  return (
    <div className="meter-metric">
      <div className="meter-label">{label}</div>
      <div className="meter-value">{children}</div>
      {note ? <div className="meter-note">{note}</div> : null}
    </div>
  );
}

/** Re-renders every `intervalMs`: plugs fall silent, and rotating lines move on, without new data. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function useRotation<T>(items: T[]): T {
  const now = useNow(ROTATE_MS);
  return items[Math.floor(now / ROTATE_MS) % items.length];
}

function minutesAndSeconds(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** In the room, measured: the room's electricity from the plugs. */
function Here({ readings }: { readings: RoomPowerReading[] }): ReactElement | null {
  const now = useNow(1_000);
  const room = roomFootprintOf(readings, now);
  if (room.plugs.length === 0 && room.energyWh === 0) return null;

  const energy = toDisplayRange("energy", { low: room.energyWh / 1000, high: room.energyWh / 1000 });
  return (
    <Section title="In the room" status="Measured" className="meter-grid">
      <Metric label="Power now">
        {room.plugs.length > 0 ? (
          <>
            <NumberFlow value={Math.round(room.watts)} />
            <span className="meter-unit">W</span>
          </>
        ) : (
          "–"
        )}
      </Metric>
      <Metric label="Electricity so far">
        <Figure value={energy.low} />
        <span className="meter-unit">{energy.unit}</span>
      </Metric>
      {room.plugs.length > 0 ? (
        <ul className="meter-list meter-wide">
          {room.plugs.map((plug) => (
            <li key={plug.plug}>
              <span>{plug.label}</span>
              <span className="meter-dim">{Math.round(plug.watts)} W</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** Current meeting, counted: exactly what the providers bill for, as far as the room has heard. */
function Counted({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const counted = countedOf(rows);
  return (
    <Section title="Current meeting" status="Counted" className="meter-grid meter-grid--three">
      <Metric label="Tokens written">
        <NumberFlow value={counted.tokensWritten} />
      </Metric>
      <Metric label="Speaking">{minutesAndSeconds(counted.spokenSeconds)}</Metric>
      <Metric label="Listening">{minutesAndSeconds(counted.listenedSeconds)}</Metric>
      <p className="meter-dim meter-small meter-wide">A token is a piece of a word, about three quarters of one.</p>
    </Section>
  );
}

/** The model's own name, without the router's maker prefix ("mistral/…"). */
function modelName(model: string): string {
  return model.split("/").pop() ?? model;
}

const ROLE_WORDS = { writing: "writing", speaking: "speaking", listening: "listening" } as const;

/** Models called in the last minute — when they are called, which runs ahead of what is heard. */
function ActiveNow({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const active = activeModels(rows, useNow(5_000));
  return (
    <Section title="Active now" className="meter-stack">
      {active.length > 0 ? (
        <ul className="meter-list">
          {active.map((row) => {
            const entry = findEcologitsModel(row.provider, row.model);
            return (
              <li key={`${row.provider}|${row.model}`}>
                <span>
                  {modelName(row.model)}
                  {entry ? <span className="meter-dim"> · {ROLE_WORDS[entry.role]}</span> : null}
                </span>
                <span className="meter-dim">{entry ? zoneName(entry.datacenterZone) : "unknown"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="meter-dim meter-small">No model called in the last minute.</p>
      )}
    </Section>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Datacentre, estimated: energy, water and carbon as ranges, each with what it leaves out. */
function Datacentre({ title, rows, large }: { title: string; rows: UsageTotalsRow[]; large?: boolean }): ReactElement {
  const impacts = footprintOf(rows);
  const guessed = guessedShareOf(rows);
  return (
    <Section title={title} status="Estimated" className={`meter-stack${large ? " meter-large" : ""}`}>
      <Metric label="Energy" note="Writing the answers only: not reading, not the networks, not training.">
        <Range range={toDisplayRange("energy", impacts.energy)} />
      </Metric>
      <Metric label="Water" note="For cooling and for the electricity. Not the water used to make the chips.">
        <Range range={toDisplayRange("wcf", impacts.wcf)} />
      </Metric>
      <Metric label="Carbon" note="Assumes each country's average grid: nobody says where the answers really ran.">
        <Range range={toDisplayRange("gwp", impacts.gwp)} />
      </Metric>
      {guessed ? (
        <p className="meter-guessed">
          {guessed.high - guessed.low < 0.01 ? percent(guessed.low) : `${percent(guessed.low)}–${percent(guessed.high)}`} of
          this energy rests on guesses about models nobody has described.
        </p>
      ) : null}
    </Section>
  );
}

/** Minerals as what the estimate is built from: GPU time, and where the minerals come from. */
function Hardware({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const place = useRotation(MINERAL_PLACES);
  return (
    <Section title="Hardware" status="Estimated" className="meter-stack">
      <Metric
        label="Kept AI chips busy for"
        note="The minerals in chips and servers are shared out by this time over their three-year life."
      >
        <Range range={toDisplayRange("gpuTime", gpuTimeOf(rows))} />
      </Metric>
      <p className="meter-place-line" key={place.mineral}>
        <strong>{place.mineral}</strong>, for {place.use}: {place.place}.
      </p>
      <p className="meter-dim meter-small">We cannot know which mine supplied which chip.</p>
    </Section>
  );
}

/** What no figure here includes, and what the companies do not say, under one heading. */
function Uncounted(): ReactElement {
  const training = TRAINING_DISCLOSURES.find((entry) => entry.disclosed)?.disclosed;
  const silent = [...new Set(TRAINING_DISCLOSURES.filter((entry) => !entry.disclosed).map((entry) => entry.maker))];
  return (
    <Section title="Not counted or disclosed" className="meter-stack">
      <ul className="meter-list meter-small">
        {[...NOT_COUNTED, ...NOT_DISCLOSED].map((item) => <li key={item}>{item}</li>)}
        <li>
          Training: only Mistral publishes it
          {training
            ? ` — Large 2, ${formatRange(toDisplayRange("gwp", { low: training.gwpKgCo2e, high: training.gwpKgCo2e }), 3)} and ${formatRange(toDisplayRange("wcf", { low: training.waterL, high: training.waterL }), 3)} of water`
            : ""}
          . Not disclosed by {silent.join(", ")}.
        </li>
      </ul>
    </Section>
  );
}

export function Meter(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const venueId = params.get("venue")?.trim() || undefined;
  const demo = params.has("demo");

  const state = useMeterFeed(venueId, demo);
  // The meeting as the room has heard it: replies are generated ahead and played gradually.
  const heard = playedRows(state.meeting);

  return (
    <main className="meter">
      {demo ? <div className="meter-demo">DEMO DATA</div> : null}
      <Here readings={state.room} />
      {state.meeting ? <Counted rows={heard} /> : null}
      <ActiveNow rows={venueId || demo ? state.venue : state.global} />
      {state.meeting ? (
        <>
          <Datacentre title="Datacentre" rows={heard} large />
          <Hardware rows={heard} />
        </>
      ) : null}
      {venueId || demo ? (
        <Datacentre title={`Since opening at ${state.venueName ?? venueId ?? "this venue"}`} rows={state.venue} />
      ) : null}
      <Uncounted />
      <footer className="meter-footer">
        <div>
          Estimates with EcoLogits {ECOLOGITS_VERSION}, shown as ranges because nobody knows the exact figure.
          Scan for how they are made.
        </div>
        <QRCodeSVG className="meter-qr" value={methodologyUrl()} bgColor="#000000" fgColor="#f2efe6" marginSize={0} />
      </footer>
    </main>
  );
}
