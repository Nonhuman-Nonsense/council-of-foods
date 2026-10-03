import NumberFlow from "@number-flow/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { RoomPowerReading, UsageTotalsRow } from "@shared/MeterTypes";
import { ECOLOGITS_VERSION, estimateImpacts, findEcologitsModel, type ImpactRange } from "@shared/footprint/ecologits";
import { MINERAL_PLACES, NOT_COUNTED, NOT_DISCLOSED, PUBLISHED_COUNTS } from "@shared/footprint/counting";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import {
  countedOf,
  footprintOf,
  formatRange,
  gpuTimeOf,
  guessedShareOf,
  roomFootprintOf,
  toDisplayRange,
  significant,
  type DisplayRange,
} from "./meterState";
import { methodologyUrl } from "./modelInfo";
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

/** Here, measured: the room's electricity from the plugs. */
function Here({ readings }: { readings: RoomPowerReading[] }): ReactElement | null {
  const now = useNow(1_000);
  const room = roomFootprintOf(readings, now);
  if (room.plugs.length === 0 && room.energyWh === 0) return null;

  const energy = toDisplayRange("energy", { low: room.energyWh / 1000, high: room.energyWh / 1000 });
  return (
    <Section title="Here" status="Measured" className="meter-grid">
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

/** This meeting, counted: exactly what the providers bill for. */
function Counted({ rows }: { rows: UsageTotalsRow[] }): ReactElement {
  const counted = countedOf(rows);
  return (
    <Section title="This meeting" status="Counted" className="meter-grid meter-grid--three">
      <Metric label="Replies written">
        <NumberFlow value={counted.replies} />
      </Metric>
      <Metric label="Speaking">{minutesAndSeconds(counted.spokenSeconds)}</Metric>
      <Metric label="Listening">{minutesAndSeconds(counted.listenedSeconds)}</Metric>
    </Section>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Elsewhere, estimated: energy, water and carbon as ranges, each with what it leaves out. */
function Elsewhere({ title, rows, large }: { title: string; rows: UsageTotalsRow[]; large?: boolean }): ReactElement {
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

interface CountingLine {
  label: string;
  unit: string;
  published: (number | undefined)[];
  ours: ImpactRange;
}

function countingLines(): CountingLine[] {
  const dialogue = findEcologitsModel("inworld", "mistral/mistral-large-3");
  const ours = dialogue ? estimateImpacts(dialogue, { measures: { output_tokens: 400 }, requests: 1 }) : null;
  if (!ours) return [];
  return [
    { label: "Water", unit: "mL", published: PUBLISHED_COUNTS.map((c) => c.perAnswer.waterMl), ours: { low: ours.wcf.low * 1e3, high: ours.wcf.high * 1e3 } },
    { label: "Carbon", unit: "g CO₂e", published: PUBLISHED_COUNTS.map((c) => c.perAnswer.co2eG), ours: { low: ours.gwp.low * 1e3, high: ours.gwp.high * 1e3 } },
    { label: "Energy", unit: "Wh", published: PUBLISHED_COUNTS.map((c) => c.perAnswer.energyWh), ours: { low: ours.energy.low * 1e3, high: ours.energy.high * 1e3 } },
  ];
}

/** Who's counting: the same answer, by each source's own boundary. */
function WhosCounting(): ReactElement | null {
  const line = useRotation(countingLines());
  if (!line) return null;
  const counts = PUBLISHED_COUNTS.flatMap((count, i) => {
    const value = line.published[i];
    return value === undefined ? [] : [`${count.who} ${formatRange({ low: value, high: value, unit: line.unit }, 3)}`];
  });
  return (
    <Section title="Who's counting" className="meter-stack">
      <p className="meter-counting" key={line.label}>
        <span className="meter-label">{line.label} for one answer</span>
        <span>{[...counts, `EcoLogits ${formatRange({ ...line.ours, unit: line.unit })}`].join(" · ")}</span>
      </p>
      <p className="meter-dim meter-small">Each draws the line somewhere else.</p>
    </Section>
  );
}

/** What no figure here includes, and what the companies do not say. */
function Uncounted(): ReactElement {
  const training = TRAINING_DISCLOSURES.find((entry) => entry.disclosed)?.disclosed;
  const silent = [...new Set(TRAINING_DISCLOSURES.filter((entry) => !entry.disclosed).map((entry) => entry.maker))];
  return (
    <>
      <Section title="Not counted" className="meter-stack">
        <ul className="meter-list meter-small">
          {NOT_COUNTED.map((item) => <li key={item}>{item}</li>)}
        </ul>
        {training ? (
          <p className="meter-small">
            The one training figure published, Mistral Large 2:{" "}
            {formatRange(toDisplayRange("gwp", { low: training.gwpKgCo2e, high: training.gwpKgCo2e }), 3)} and{" "}
            {formatRange(toDisplayRange("wcf", { low: training.waterL, high: training.waterL }), 3)} of water.
          </p>
        ) : null}
      </Section>
      <Section title="Not disclosed" className="meter-stack">
        <ul className="meter-list meter-small">
          {NOT_DISCLOSED.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="meter-dim meter-small">Training never disclosed by {silent.join(", ")}.</p>
      </Section>
    </>
  );
}

export function Meter(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const venueId = params.get("venue")?.trim() || undefined;
  const demo = params.has("demo");

  const state = useMeterFeed(venueId, demo);
  const meetingRows = state.meeting?.totals ?? [];

  return (
    <main className="meter">
      {demo ? <div className="meter-demo">DEMO DATA</div> : null}
      <Here readings={state.room} />
      {state.meeting ? (
        <>
          <Counted rows={meetingRows} />
          <Elsewhere title="Elsewhere" rows={meetingRows} large />
          <Hardware rows={meetingRows} />
        </>
      ) : null}
      <WhosCounting />
      <Uncounted />
      {venueId || demo ? (
        <Elsewhere title={`Since opening at ${state.venueName ?? venueId ?? "this venue"}`} rows={state.venue} />
      ) : null}
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
