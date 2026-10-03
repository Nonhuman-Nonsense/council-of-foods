import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { MeterSnapshot, UsageTotalsRow } from "@shared/MeterTypes";
import {
  ECOLOGITS_VERSION,
  estimateGpuSeconds,
  estimateImpacts,
  estimateManufacturing,
  findEcologitsModel,
  HARDWARE,
  listEcologitsModels,
  type EcologitsModel,
  type ModelBasis,
} from "@shared/footprint/ecologits";
import { MINERAL_PLACES, NOT_COUNTED, NOT_DISCLOSED, PUBLISHED_COUNTS } from "@shared/footprint/counting";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import { countedOf, footprintOf, formatRange, gpuTimeOf, toDisplayRange } from "./meterState";
import { MODEL_ROLES, zoneName } from "./modelInfo";

/**
 * The methodology page behind the meter's QR code, read on a visitor's phone. It follows the
 * screen's chain of certainty — measured, counted, estimated, guessed, not counted — and is
 * generated from the same tables the meter computes with, so the two cannot drift.
 */

const BASIS_TEXT: Record<ModelBasis, string> = {
  ecologits: "EcoLogits' own description of the model",
  corrected: "EcoLogits' method, on the size the maker publishes (EcoLogits' own entry is wrong)",
  guessed: "Guessed: the maker publishes nothing, so EcoLogits' method runs on our analogy",
};

/** One answer of the dialogue model, the unit the published figures are given in. */
const ONE_ANSWER = { measures: { output_tokens: 400 }, requests: 1 };

function Sources({ urls }: { urls: string[] }): ReactElement | null {
  if (urls.length === 0) return null;
  return (
    <p className="method-sources">
      Sources:{" "}
      {urls.map((url, i) => (
        <span key={url}>
          {i > 0 ? ", " : null}
          <a href={url}>{new URL(url).hostname.replace(/^www\./, "")}</a>
        </span>
      ))}
    </p>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): ReactElement {
  return (
    <article className="method-model">
      <h3>{title}</h3>
      {subtitle ? <p className="method-role">{subtitle}</p> : null}
      {children}
    </article>
  );
}

function formatParameters(model: EcologitsModel): string {
  const range = ([low, high]: [number, number]) => (low === high ? `${low}B` : `${low}–${high}B`);
  const active = range(model.activeParameters);
  const total = range(model.totalParameters);
  return active === total ? `${total} parameters` : `${total} parameters, ${active} active per token`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function ModelEntry({ id, model }: { id: string; model: EcologitsModel }): ReactElement {
  const isAudio = model.usageMeasure === "audio_seconds";
  const reference = isAudio
    ? { label: "per minute of audio", usage: { measures: { audio_seconds: 60 }, requests: 1 } }
    : { label: "per 400-token answer", usage: ONE_ANSWER };
  const impacts = estimateImpacts(model, reference.usage);
  const fromHardware = estimateManufacturing(model, reference.usage).adpe.high / impacts.adpe.high;

  return (
    <Card title={id.split("|")[1]} subtitle={MODEL_ROLES[id] ?? "Used by the council"}>
      <dl>
        <dt>Known from</dt>
        <dd>{BASIS_TEXT[model.basis]}</dd>
        <dt>Assumed location</dt>
        <dd>{zoneName(model.datacenterZone)}</dd>
        <dt>Size</dt>
        <dd>{formatParameters(model)}</dd>
        <dt>Energy {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("energy", impacts.energy))}</dd>
        <dt>Water {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("wcf", impacts.wcf))}</dd>
        <dt>Carbon {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("gwp", impacts.gwp))}</dd>
        <dt>GPU time {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("gpuTime", estimateGpuSeconds(model, reference.usage)))}</dd>
        <dt>Minerals {reference.label}</dt>
        <dd>
          {formatRange(toDisplayRange("adpe", impacts.adpe))}, {percent(fromHardware)} from making the hardware
        </dd>
      </dl>
      {model.assumptions.length > 0 ? (
        <ul className="method-assumptions">
          {model.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>
      ) : null}
      {model.warnings.length > 0 ? <p className="method-warning">EcoLogits notes: {model.warnings.join(" ")}</p> : null}
      <Sources urls={model.sources} />
    </Card>
  );
}

function WhosCounting(): ReactElement {
  const dialogue = findEcologitsModel("inworld", "mistral/mistral-large-3");
  const ours = dialogue ? estimateImpacts(dialogue, ONE_ANSWER) : null;
  const published = (value: number | undefined, unit: string) =>
    value === undefined ? "not published" : formatRange({ low: value, high: value, unit }, 3);

  return (
    <section>
      <h2>Who's counting</h2>
      <p>
        There is no agreed way to count what an AI answer costs. Each estimate depends on where someone decided to
        stop counting: Google and Mistral AI have each published figures for one answer, and their water figures
        differ more than a hundredfold, mostly because they count different things.
      </p>
      {PUBLISHED_COUNTS.map((count) => (
        <Card key={count.who} title={count.who} subtitle={`One answer: ${count.answer}`}>
          <dl>
            <dt>Counts</dt>
            <dd>{count.counts}</dd>
            <dt>Leaves out</dt>
            <dd>{count.leavesOut}</dd>
            <dt>Energy</dt>
            <dd>{published(count.perAnswer.energyWh, "Wh")}</dd>
            <dt>Water</dt>
            <dd>{published(count.perAnswer.waterMl, "mL")}</dd>
            <dt>Carbon</dt>
            <dd>{published(count.perAnswer.co2eG, "g CO₂e")}</dd>
            <dt>Minerals</dt>
            <dd>{published(count.perAnswer.mineralsMgSbEq, "mg Sb eq")}</dd>
          </dl>
          <Sources urls={count.sources} />
        </Card>
      ))}
      {ours ? (
        <Card title="EcoLogits, as used here" subtitle="One answer: 400 tokens from Mistral Large 3, the council's dialogue model">
          <dl>
            <dt>Counts</dt>
            <dd>
              the electricity of the GPUs and servers with data-centre overhead, the water used to cool them and to
              generate their electricity, and a share of making the GPUs and servers
            </dd>
            <dt>Leaves out</dt>
            <dd>training, reading the input, networks, idle capacity, the water used to make the chips, e-waste</dd>
            <dt>Energy</dt>
            <dd>{formatRange(toDisplayRange("energy", ours.energy))}</dd>
            <dt>Water</dt>
            <dd>{formatRange(toDisplayRange("wcf", ours.wcf))}</dd>
            <dt>Carbon</dt>
            <dd>{formatRange(toDisplayRange("gwp", ours.gwp))}</dd>
            <dt>Minerals</dt>
            <dd>{formatRange(toDisplayRange("adpe", ours.adpe))}</dd>
          </dl>
        </Card>
      ) : null}
      <p>
        The models are not the same — Google's figure is for Gemini, Mistral's for its previous large model — so the
        comparison shows how much the boundary matters, not which model is cleaner.
      </p>
    </section>
  );
}

function Minerals(): ReactElement {
  const lifeYears = Math.round(HARDWARE.lifetimeSeconds / (365 * 24 * 3600));
  return (
    <section>
      <h2>Minerals: why the screen shows GPU time</h2>
      <p>
        EcoLogits expresses minerals as <em>abiotic resource depletion</em>, in kilograms of antimony-equivalent
        (Sb eq): every metal mined is weighted by how scarce it is, relative to antimony. It is the standard
        life-cycle measure, and it means little to anyone standing in front of it.
      </p>
      <p>
        Almost all of it — over 99% for the models here — comes not from running the models but from making the
        hardware. EcoLogits takes one published estimate for a server and one for a GPU ({HARDWARE.gpu}), assumes
        they last {lifeYears} years, and gives each request a share by the time it keeps the GPUs busy, shared with
        the {HARDWARE.batchSize - 1} other requests served at the same moment. Its authors note that the uncertainty
        of those hardware estimates is not quantified.
      </p>
      <p>
        So the screen shows what the mineral figure is actually built from: the GPU time the council occupied. The
        Sb eq figures are given per model below. And because a weighted mass says nothing about where the ground was
        opened, the screen names places in the supply of the minerals the hardware is made with. Nobody can trace
        which mine supplied which chip; these places are documented, not our hardware's own history.
      </p>
      {MINERAL_PLACES.map((place) => (
        <Card key={place.mineral} title={`${place.mineral} — ${place.place}`} subtitle={`Used for ${place.use}`}>
          <p>{place.note}</p>
          <Sources urls={place.sources} />
        </Card>
      ))}
    </section>
  );
}

function Training(): ReactElement {
  return (
    <section>
      <h2>Not counted: training</h2>
      <p>
        Before a model can speak it has to be trained, on thousands of GPUs, in data centres built for it. That cost
        is paid once and shared by everyone who ever uses the model; no maker publishes how many answers a model
        gives, so it cannot be divided per meeting. Where it is published, it is shown here whole.
      </p>
      {TRAINING_DISCLOSURES.map((entry) => (
        <Card key={entry.model} title={entry.model} subtitle={entry.maker}>
          {entry.disclosed ? (
            <>
              <p>{entry.disclosed.scope}</p>
              <dl>
                <dt>Carbon</dt>
                <dd>{formatRange(toDisplayRange("gwp", { low: entry.disclosed.gwpKgCo2e, high: entry.disclosed.gwpKgCo2e }), 3)}</dd>
                <dt>Water</dt>
                <dd>{formatRange(toDisplayRange("wcf", { low: entry.disclosed.waterL, high: entry.disclosed.waterL }), 3)}</dd>
                <dt>Minerals</dt>
                <dd>{formatRange(toDisplayRange("adpe", { low: entry.disclosed.adpeKgSbEq, high: entry.disclosed.adpeKgSbEq }), 3)}</dd>
              </dl>
              {entry.disclosed.trainingHardware ? <p>{entry.disclosed.trainingHardware}</p> : null}
            </>
          ) : (
            <p className="method-undisclosed">Not disclosed.</p>
          )}
          <p>{entry.note}</p>
          {entry.disclosed ? <Sources urls={entry.disclosed.sources} /> : null}
        </Card>
      ))}
    </section>
  );
}

/** Every council, everywhere, from the same snapshot the meter loads. */
function AllCouncils(): ReactElement | null {
  const [rows, setRows] = useState<UsageTotalsRow[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/meter", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MeterSnapshot>) : null))
      .then((snapshot) => {
        if (snapshot) setRows(snapshot.global);
      })
      .catch(() => {
        // Without the totals the page simply leaves this section out.
      });
    return () => controller.abort();
  }, []);
  if (!rows || rows.length === 0) return null;

  const impacts = footprintOf(rows);
  const counted = countedOf(rows);
  return (
    <section>
      <h2>All councils</h2>
      <p>Every council, at every venue and online, since counting began.</p>
      <dl className="method-totals">
        <dt>Replies written</dt>
        <dd>{counted.replies.toLocaleString("en")}</dd>
        <dt>Speaking</dt>
        <dd>{Math.round(counted.spokenSeconds / 60).toLocaleString("en")} minutes</dd>
        <dt>Listening</dt>
        <dd>{Math.round(counted.listenedSeconds / 60).toLocaleString("en")} minutes</dd>
        <dt>Energy</dt>
        <dd>{formatRange(toDisplayRange("energy", impacts.energy))}</dd>
        <dt>Water</dt>
        <dd>{formatRange(toDisplayRange("wcf", impacts.wcf))}</dd>
        <dt>Carbon</dt>
        <dd>{formatRange(toDisplayRange("gwp", impacts.gwp))}</dd>
        <dt>GPU time</dt>
        <dd>{formatRange(toDisplayRange("gpuTime", gpuTimeOf(rows)))}</dd>
      </dl>
    </section>
  );
}

export function Methodology(): ReactElement {
  return (
    <main className="methodology">
      <h1>How the footprint is estimated</h1>
      <p>
        This council uses artificial intelligence to speak for the forest. That speech has a material cost:
        electricity, water for cooling and for generating that electricity, greenhouse gases, and minerals mined for
        the chips it runs on. Some of it can be measured in this room. Most of it is paid far from here, and has to
        be estimated, because the companies running the models do not disclose what it takes. This page explains
        how each figure on the screen is known, and how uncertain it is.
      </p>

      <section>
        <h2>How each figure is known</h2>
        <dl className="method-chain">
          <dt>Measured</dt>
          <dd>The electricity of this room — projector, computer, speakers, screens — from power meters in the plugs.</dd>
          <dt>Counted</dt>
          <dd>
            What the AI providers bill for, exactly: replies written, seconds of speech produced, seconds of the
            visitors' speech listened to. No estimate involved.
          </dd>
          <dt>Estimated</dt>
          <dd>
            Energy, water, carbon and hardware time, from that usage, with{" "}
            <a href="https://ecologits.ai/latest/methodology/llm_inference/">EcoLogits</a> {ECOLOGITS_VERSION}, an open
            life-cycle method by the non-profit GenAI Impact. Its only measured layer is the energy of open models on
            one type of GPU; for the council's models it extrapolates from their size, which is itself mostly
            estimated.
          </dd>
          <dt>Guessed</dt>
          <dd>
            The voices and the listening. Their makers publish nothing about the models, and EcoLogits does not cover
            speech; we run its method on a reasoned analogy. The screen says how much of each estimate rests on
            these guesses.
          </dd>
          <dt>Not counted</dt>
          <dd>{NOT_COUNTED.join(". ")}.</dd>
          <dt>Not disclosed</dt>
          <dd>{NOT_DISCLOSED.join(". ")}.</dd>
        </dl>
      </section>

      <section>
        <h2>Ranges, not single numbers</h2>
        <p>
          Every estimate is shown as a range, with no number in the middle. The ends are not a forecast with a most
          likely value: they are what EcoLogits gives for the smallest and largest plausible inputs it can vary — the
          model's size, the data centre's efficiency, and for Mistral Large 3 whether it is served with 8-bit or 16-bit
          weights. The middle of that range is no more likely than any other point in it.
        </p>
        <p>
          And the range is still too narrow. It does not vary what EcoLogits fixes: the kind of chip (Gemini runs on
          Google's own chips, not the GPUs assumed), how many requests share them, where the data centres are, or the
          hardware estimates, whose uncertainty nobody has quantified. Each figure is an estimate resting on other
          estimates. Numbers are rounded to two significant figures, so they claim no more precision than that.
        </p>
      </section>

      <section>
        <h2>Measured: this room</h2>
        <p>
          The room's electricity is not estimated but measured, by the plugs, and shown as it happens. It is the part
          of the cost you can see, and in any one hour it may well be larger than the electricity of the answers
          themselves. What is paid elsewhere is not mostly electricity: it is water, minerals, training, and place.
        </p>
      </section>

      <WhosCounting />
      <Minerals />

      <section>
        <h2>The models</h2>
        {listEcologitsModels().map(([id, model]) => <ModelEntry key={id} id={id} model={model} />)}
      </section>

      <Training />
      <AllCouncils />

      <footer>
        <p>
          EcoLogits is open source (MPL-2.0): <a href="https://github.com/mlco2/ecologits">github.com/mlco2/ecologits</a>.
          Model sizes that EcoLogits lacks or lists incorrectly are taken from the sources given with each model.
        </p>
      </footer>
    </main>
  );
}
