import NumberFlow from "@number-flow/react";
import { QRCodeSVG } from "qrcode.react";
import { Fragment, useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { MeterMeeting, RoomPowerReading, UsageTotalsRow } from "@shared/MeterTypes";
import { ECOLOGITS_VERSION, findEcologitsModel } from "@shared/footprint/ecologits";
import { MINERAL_PLACES, OUTSIDE_THE_NUMBERS } from "@shared/footprint/counting";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import { WORLD_FIGURES } from "@shared/footprint/world";
import {
  activeModels,
  countedOf,
  footprintOf,
  formatRange,
  heardVenueRows,
  isMeetingActive,
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
 * (docs/ai-footprint-meter.md). What the providers count for the current meeting, then estimates
 * for it and since opening — ranges, and floors, never the whole cost — then training, which
 * dwarfs them, and what no figure includes. Copy and layout are to be tuned on the real display.
 */

type Status = "At least";

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

/** The room's own electricity, measured by the plugs: context, not AI, so one small line. */
function RoomLine({ readings }: { readings: RoomPowerReading[] }): ReactElement {
  const now = useNow(1_000);
  const room = roomFootprintOf(readings, now);
  const energy = formatRange(toDisplayRange("energy", { low: room.energyWh / 1000, high: room.energyWh / 1000 }));
  const what = readings.map((reading) => reading.label.toLowerCase()).join(", ");
  return (
    <p className="meter-dim meter-small">
      Measured in this room{what ? ` (${what})` : ""}:{" "}
      {room.plugs.length > 0 ? `${Math.round(room.watts)} W now` : "no reading now"}, {energy} in total.
    </p>
  );
}

/** The model's own name, without the router's maker prefix ("mistral/…"). */
function modelName(model: string): string {
  return model.split("/").pop() ?? model;
}

/**
 * Models called in the last minute — when they are called, which runs ahead of what is heard.
 */
function ActiveModels({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const active = activeModels(rows, useNow(5_000));
  if (active.length === 0) {
    return <p className="meter-dim meter-small meter-wide">No model called in the last minute.</p>;
  }
  return (
    <ul className="meter-list meter-wide">
      {active.map((row) => {
        const entry = findEcologitsModel(row.provider, row.model);
        return (
          <li key={`${row.provider}|${row.model}`}>
            <span>
              {modelName(row.model)}
              {entry ? <span className="meter-dim"> · {entry.role}</span> : null}
            </span>
            <span className="meter-dim">{entry ? zoneName(entry.datacenterZone) : "unknown"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Energy, water and carbon as ranges, three across. Each is a floor: see Outside these numbers. */
function Impacts({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const impacts = footprintOf(rows);
  return (
    <>
      <Metric label="Energy"><Range range={toDisplayRange("energy", impacts.energy)} /></Metric>
      <Metric label="Water"><Range range={toDisplayRange("wcf", impacts.wcf)} /></Metric>
      <Metric label="Carbon"><Range range={toDisplayRange("gwp", impacts.gwp)} /></Metric>
    </>
  );
}

/**
 * The current meeting: what the providers bill for, exactly, then what that costs in the data
 * centres, at least — as far as the room has heard — and the models working on it now.
 */
function CurrentMeeting({ meeting, rows, activeRows }: {
  meeting: MeterMeeting;
  rows: UsageTotalsRow[];
  activeRows: UsageTotalsRow[];
}): ReactElement {
  const counted = countedOf(rows);
  const active = isMeetingActive(meeting, useNow(5_000));
  return (
    <Section title={active ? "Current meeting" : "Last meeting"} status="At least" className="meter-grid meter-grid--three">
      <Metric label="Text">
        <NumberFlow value={counted.tokensWritten} />
        <span className="meter-unit">tokens</span>
      </Metric>
      <Metric label="Text to speech">
        {minutesAndSeconds(counted.spokenSeconds)}
        <span className="meter-unit">min</span>
      </Metric>
      <Metric label="Speech to text">
        {minutesAndSeconds(counted.listenedSeconds)}
        <span className="meter-unit">min</span>
      </Metric>
      <Impacts rows={rows} />
      <ActiveModels rows={activeRows} />
    </Section>
  );
}

/** Where the minerals in the hardware come from, one documented place at a time. */
function MineralPlace(): ReactElement {
  const place = useRotation(MINERAL_PLACES);
  return (
    <div>
      <p className="meter-place-line" key={place.mineral}>
        <strong>{place.mineral}</strong>, for {place.use}: {place.place}.
      </p>
      <p className="meter-dim meter-small">We cannot know which mine supplied which chip.</p>
    </div>
  );
}

/**
 * Training, in grams and litres so the length of the numbers shows its scale against the
 * figures above. Never divided per meeting: nobody publishes how many answers a model serves.
 * Makers who publish nothing get an empty slot.
 */
function Training(): ReactElement {
  const grams = (kg: number) => formatRange({ low: kg * 1000, high: kg * 1000, unit: "g" }, 3);
  const litres = (l: number) => formatRange({ low: l, high: l, unit: "L" }, 3);
  return (
    <Section title="Training the models" className="meter-stack">
      <div className="meter-table">
        <span />
        <span className="meter-label meter-num">Carbon, CO₂e</span>
        <span className="meter-label meter-num">Water</span>
        {TRAINING_DISCLOSURES.map((entry) => entry.disclosed ? (
          <Fragment key={entry.model}>
            <span className="meter-dim">{entry.disclosed.figuresFor}*</span>
            <span className="meter-bright meter-num">{grams(entry.disclosed.gwpKgCo2e)}</span>
            <span className="meter-bright meter-num">{litres(entry.disclosed.waterL)}</span>
          </Fragment>
        ) : (
          <Fragment key={entry.model}>
            <span className="meter-dim">{entry.model}</span>
            <span className="meter-empty meter-num meter-table-wide">not published</span>
          </Fragment>
        ))}
      </div>
      <p className="meter-dim meter-small">
        * Training and its first 18 months of use, the only figure any maker publishes, and with no
        energy figure. The council speaks with Mistral Large 3, about five times its size.
      </p>
    </Section>
  );
}

/** The scale all of this sits in: AI's build-out around the world, as published. */
function AroundTheWorld(): ReactElement {
  return (
    <Section title="Around the world" className="meter-stack">
      <div className="meter-table">
        {WORLD_FIGURES.map((entry) => (
          <Fragment key={entry.what}>
            <span className="meter-dim">{entry.what}</span>
            <span className="meter-bright meter-num meter-table-wide">{entry.figure}</span>
          </Fragment>
        ))}
      </div>
    </Section>
  );
}

/**
 * What no figure here includes, and what the companies do not say, laid out like training: a
 * row per cost, and in place of a number, why there is none. Why every figure is a floor.
 */
function Outside(): ReactElement {
  return (
    <Section title="Outside these numbers" className="meter-stack">
      <div className="meter-table">
        {OUTSIDE_THE_NUMBERS.map(({ item, why }) => (
          <Fragment key={item}>
            <span className="meter-dim">{item}</span>
            <span className="meter-empty meter-num meter-table-wide">{why}</span>
          </Fragment>
        ))}
      </div>
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
  const venueHeard = heardVenueRows(state.venue, state.meeting);
  const atVenue = Boolean(venueId || demo);
  const venueName = atVenue ? state.venueName ?? venueId ?? "this venue" : null;

  return (
    <main className="meter">
      {demo ? <div className="meter-demo">DEMO DATA</div> : null}
      <h1 className="meter-title">The cost of the council's AI</h1>
      {state.meeting ? (
        <CurrentMeeting meeting={state.meeting} rows={heard} activeRows={atVenue ? state.venue : state.global} />
      ) : null}
      {venueName ? (
        <Section title={`Since opening at ${venueName}`} status="At least" className="meter-stack">
          <div className="meter-grid meter-grid--three">
            <Impacts rows={venueHeard} />
          </div>
          <MineralPlace />
          <RoomLine readings={state.room} />
        </Section>
      ) : null}
      <Training />
      <AroundTheWorld />
      <Outside />
      <footer className="meter-footer">
        <div>
          Estimates with EcoLogits {ECOLOGITS_VERSION}. Ranges, because nobody knows the exact figure, and
          floors, because so much is left out.
        </div>
        <figure className="meter-qr-block">
          <figcaption>Methodology</figcaption>
          <QRCodeSVG className="meter-qr" value={methodologyUrl()} bgColor="#000000" fgColor="#f2efe6" marginSize={0} />
        </figure>
      </footer>
    </main>
  );
}
