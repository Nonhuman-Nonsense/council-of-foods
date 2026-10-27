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
import { MINERAL_PLACES, OUTSIDE_THE_NUMBERS, PUBLISHED_COUNTS } from "@shared/footprint/counting";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import { WORLD_FIGURES } from "@shared/footprint/world";
import { countedOf, footprintOf, formatRange, gpuTimeOf, guessedShareOf, toDisplayRange } from "./meterState";
import { MODEL_ROLES, zoneName } from "./modelInfo";

/**
 * The methodology page behind the meter's QR code, read on a visitor's phone. Each section opens
 * with what matters in a sentence or two; the detail — every model, source and caveat — is folded
 * away to open on a tap. Generated from the same tables the meter computes with, so the two
 * cannot drift.
 */

const BASIS_SHORT: Record<ModelBasis, string> = {
  ecologits: "described",
  corrected: "described",
  guessed: "guessed",
};

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

/** A line to glance at, folding open on a tap to the detail behind it. */
function Fold({ summary, aside, children }: { summary: ReactNode; aside?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <details className="method-fold">
      <summary>
        <span>{summary}</span>
        {aside ? <span className="method-aside">{aside}</span> : null}
      </summary>
      <div className="method-fold-body">{children}</div>
    </details>
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
    <Fold
      summary={id.split("|")[1]}
      aside={`${zoneName(model.datacenterZones)} · ${BASIS_SHORT[model.basis]}`}
    >
      <p className="method-role">{MODEL_ROLES[id] ?? "Used by the council"}</p>
      <dl className="method-pairs">
        <dt>Known from</dt>
        <dd>{BASIS_TEXT[model.basis]}</dd>
        <dt>Size</dt>
        <dd>{formatParameters(model)}</dd>
        <dt>Energy {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("energy", impacts.energy))}</dd>
        <dt>Water</dt>
        <dd>{formatRange(toDisplayRange("wcf", impacts.wcf))}</dd>
        <dt>Carbon</dt>
        <dd>{formatRange(toDisplayRange("gwp", impacts.gwp))}</dd>
        <dt>GPU time</dt>
        <dd>{formatRange(toDisplayRange("gpuTime", estimateGpuSeconds(model, reference.usage)))}</dd>
        <dt>Minerals</dt>
        <dd>
          {formatRange(toDisplayRange("adpe", impacts.adpe))}, {percent(fromHardware)} from making the hardware
        </dd>
      </dl>
      {model.assumptions.length > 0 ? (
        <ul className="method-small">
          {model.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>
      ) : null}
      {model.warnings.length > 0 ? <p className="method-small">EcoLogits notes: {model.warnings.join(" ")}</p> : null}
      <Sources urls={model.sources} />
    </Fold>
  );
}

function Training(): ReactElement {
  const published = TRAINING_DISCLOSURES.find((entry) => entry.disclosed);
  const silent = TRAINING_DISCLOSURES.filter((entry) => !entry.disclosed).map((entry) => entry.maker);
  const disclosed = published?.disclosed;
  return (
    <section>
      <h2>Training the models</h2>
      <p>
        Training is paid once, before any meeting, and dwarfs everything the screen counts.
        {disclosed ? (
          <>
            {" "}Only Mistral publishes it: <strong>{formatRange(toDisplayRange("gwp", { low: disclosed.gwpKgCo2e, high: disclosed.gwpKgCo2e }), 3)}</strong>{" "}
            and <strong>{formatRange({ low: disclosed.waterL / 1e6, high: disclosed.waterL / 1e6, unit: "million litres" }, 3)}</strong>{" "}
            of water for {disclosed.figuresFor}, the predecessor of the model the council uses.
          </>
        ) : null}{" "}
        {[...new Set(silent)].join(", ")} publish nothing. Nobody publishes how many answers a model serves, so it
        cannot be divided per meeting.
      </p>
      {published?.disclosed ? (
        <Fold summary="What Mistral's figure covers">
          <p>{published.disclosed.scope}</p>
          <p>{published.note}</p>
          {published.disclosed.trainingHardware ? <p>{published.disclosed.trainingHardware}</p> : null}
          <Sources urls={published.disclosed.sources} />
        </Fold>
      ) : null}
    </section>
  );
}

function Outside(): ReactElement {
  return (
    <section>
      <h2>Outside these numbers</h2>
      <p>
        Every estimate is a floor. None of these is in the figures: some because the method stops short of them,
        some because the companies do not publish them.
      </p>
      {OUTSIDE_THE_NUMBERS.map(({ item, why, note, estimate }) => (
        <Fold key={item} summary={item} aside={estimate ? estimate.figure : why}>
          <p>{note}</p>
          {estimate ? (
            <>
              <p>{estimate.note}</p>
              <Sources urls={estimate.sources} />
            </>
          ) : null}
        </Fold>
      ))}
    </section>
  );
}

function Minerals(): ReactElement {
  const lifeYears = Math.round(HARDWARE.lifetimeSeconds / (365 * 24 * 3600));
  return (
    <section>
      <h2>Minerals</h2>
      <p>
        More than 90% of the minerals behind each answer are in the hardware, not in running it: EcoLogits shares a
        GPU's and a server's making over their {lifeYears}-year life. Its measure, antimony-equivalent, says nothing
        about where the ground was opened, so the screen names places instead. Nobody can trace which mine supplied
        which chip.
      </p>
      {MINERAL_PLACES.map((place) => (
        <Fold key={place.mineral} summary={place.mineral} aside={place.place}>
          <p className="method-role">Used for {place.use}</p>
          <p>{place.note}</p>
          <Sources urls={place.sources} />
        </Fold>
      ))}
    </section>
  );
}

function AroundTheWorld(): ReactElement {
  return (
    <section>
      <h2>Around the world</h2>
      {WORLD_FIGURES.map((entry) => (
        <Fold key={entry.what} summary={entry.what} aside={entry.figure}>
          <p>{entry.note}</p>
          <Sources urls={entry.sources} />
        </Fold>
      ))}
    </section>
  );
}

/** How Google, Mistral and this screen each count one answer: the boundary is the difference. */
function WhosCounting(): ReactElement {
  const dialogue = findEcologitsModel("inworld", "mistral/mistral-large-3");
  const ours = dialogue ? estimateImpacts(dialogue, ONE_ANSWER) : null;
  const published = (value: number | undefined, unit: string) =>
    value === undefined ? "not published" : formatRange({ low: value, high: value, unit }, 3);
  const rows = [
    ...PUBLISHED_COUNTS.map((count) => ({
      who: count.who,
      answer: count.answer,
      counts: count.counts,
      leavesOut: count.leavesOut,
      energy: published(count.perAnswer.energyWh, "Wh"),
      water: published(count.perAnswer.waterMl, "mL"),
      carbon: published(count.perAnswer.co2eG, "g CO₂e"),
      sources: count.sources,
    })),
    ...(ours
      ? [{
          who: "This screen (EcoLogits)",
          answer: "400 tokens from Mistral Large 3",
          counts: "the GPUs' and servers' electricity with the data centre's overhead, the water for cooling and for the electricity, and a share of making the hardware",
          leavesOut: "training, and everything under Outside these numbers",
          energy: formatRange(toDisplayRange("energy", ours.energy)),
          water: formatRange(toDisplayRange("wcf", ours.wcf)),
          carbon: formatRange(toDisplayRange("gwp", ours.gwp)),
          sources: [] as string[],
        }]
      : []),
  ];
  return (
    <section>
      <h2>Who's counting</h2>
      <p>
        There is no agreed way to count what one AI answer costs. Google and Mistral have each published a figure;
        their water figures differ more than a hundredfold, mostly because they count different things.
      </p>
      {rows.map((row) => (
        <Fold key={row.who} summary={row.who} aside={`water ${row.water}`}>
          <p className="method-role">One answer: {row.answer}</p>
          <dl className="method-pairs">
            <dt>Energy</dt>
            <dd>{row.energy}</dd>
            <dt>Water</dt>
            <dd>{row.water}</dd>
            <dt>Carbon</dt>
            <dd>{row.carbon}</dd>
          </dl>
          <p>Counts {row.counts}. Leaves out {row.leavesOut}.</p>
          <Sources urls={row.sources} />
        </Fold>
      ))}
    </section>
  );
}

interface Reference {
  title: string;
  url: string;
}

/** Everything the screen and this page rest on, grouped as the page reads. */
const REFERENCES: { group: string; items: Reference[] }[] = [
  {
    group: "The method",
    items: [
      { title: "EcoLogits — methodology for LLM inference", url: "https://ecologits.ai/latest/methodology/llm_inference/" },
      { title: "EcoLogits — source code (MPL-2.0)", url: "https://github.com/mlco2/ecologits" },
      { title: "EcoLogits pull request #262 — Mistral Large 3's published size", url: "https://github.com/mlco2/ecologits/pull/262" },
      { title: "Google (2025) — Measuring the environmental impact of delivering AI at Google Scale", url: "https://arxiv.org/abs/2508.15734" },
      { title: "Mistral AI (2025) — Our contribution to a global environmental standard for AI", url: "https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai" },
    ],
  },
  {
    group: "The models and where they run",
    items: [
      { title: "Mistral AI — Introducing Mistral 3", url: "https://mistral.ai/news/mistral-3/" },
      { title: "Mistral Large 3 — model card", url: "https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512-NVFP4" },
      { title: "Mistral AI — When using Mistral AI's API, where is my data stored?", url: "https://help.mistral.ai/en/articles/156206-when-using-mistral-ai-s-api-where-is-my-data-stored" },
      { title: "Inworld (2025) — TTS-1 technical report", url: "https://arxiv.org/abs/2507.21138" },
      { title: "Inworld — regional deployments", url: "https://docs.inworld.ai/portal/regions" },
      { title: "Inworld — realtime speech-to-text", url: "https://docs.inworld.ai/stt/overview" },
      { title: "Google Cloud — Inworld customer story", url: "https://cloud.google.com/customers/inworld" },
      { title: "ElevenLabs — data residency", url: "https://elevenlabs.io/docs/overview/administration/data-residency" },
      { title: "Soniox — data residency", url: "https://soniox.com/docs/data-residency" },
      { title: "NVIDIA Parakeet TDT 0.6B v2 — model card", url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2" },
      { title: "OpenAI Whisper large-v3 — model card", url: "https://huggingface.co/openai/whisper-large-v3" },
    ],
  },
  {
    group: "Training and development",
    items: [
      { title: "Morrison et al. (ICLR 2025) — Holistically evaluating the environmental impact of creating language models", url: "https://arxiv.org/abs/2503.05804" },
    ],
  },
  {
    group: "Around the world",
    items: [
      { title: "International Energy Agency (2026) — Key questions on energy and AI", url: "https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary" },
      { title: "Wang et al., Nature Computational Science (2024) — E-waste challenges of generative artificial intelligence", url: "https://www.nature.com/articles/s43588-024-00712-6" },
      { title: "Science Media Centre Spain — Generative AI expansion could create up to five million tonnes of e-waste", url: "https://sciencemediacentre.es/en/generative-ai-expansion-could-create-five-million-tonnes-e-waste" },
    ],
  },
  {
    group: "Minerals",
    items: [
      { title: "Argus Media — Rubaya mine collapse and the tantalum supply chain", url: "https://www.argusmedia.com/en/news-and-insights/market-opinion-and-analysis-blog/rubaya-mine-collapse-tantalum-supply-chain" },
      { title: "Swissinfo — UN experts warn Congo's conflict minerals slipping into global market", url: "https://www.swissinfo.ch/eng/international-geneva/un-experts-warn-congos-conflict-minerals-slipping-into-global-market/89978793" },
      { title: "Al Jazeera (2026) — More than 200 killed in mine collapse in eastern DR Congo", url: "https://www.aljazeera.com/news/2026/1/31/more-than-200-killed-in-mine-collapse-in-eastern-dr-congo-report" },
      { title: "Our World in Data — Most of the world's cobalt is mined in the DR Congo, but refined in China", url: "https://ourworldindata.org/data-insights/most-of-the-worlds-cobalt-is-mined-in-the-democratic-republic-of-congo-but-refined-in-china" },
      { title: "Amnesty International (2016) — DRC: cobalt and child labour", url: "https://www.amnesty.org/en/latest/campaigns/2016/06/drc-cobalt-child-labour/" },
      { title: "U.S. Geological Survey — Mineral Commodity Summaries 2026: gallium", url: "https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-gallium.pdf" },
      { title: "Wikipedia — Monturaqui-Negrillar-Tilopozo Aquifer", url: "https://en.wikipedia.org/wiki/Monturaqui-Negrillar-Tilopozo_Aquifer" },
      { title: "Mongabay (2024) — Chilean Indigenous association participates in key study for lawsuit against mining", url: "https://news.mongabay.com/2024/10/chilean-indigenous-association-participates-in-key-study-for-lawsuit-against-mining/" },
    ],
  },
];

function References(): ReactElement {
  return (
    <section>
      <h2>References</h2>
      {REFERENCES.map(({ group, items }) => (
        <Fold key={group} summary={group} aside={`${items.length}`}>
          <ul className="method-references">
            {items.map(({ title, url }) => (
              <li key={url}>
                <a href={url}>{title}</a>
              </li>
            ))}
          </ul>
        </Fold>
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
  const guessed = guessedShareOf(rows);
  return (
    <section>
      <h2>All councils so far</h2>
      <dl className="method-pairs">
        <dt>Text</dt>
        <dd>{counted.tokensWritten.toLocaleString("en")} tokens</dd>
        <dt>Text to speech</dt>
        <dd>{Math.round(counted.spokenSeconds / 60).toLocaleString("en")} min</dd>
        <dt>Speech to text</dt>
        <dd>{Math.round(counted.listenedSeconds / 60).toLocaleString("en")} min</dd>
        <dt>Energy</dt>
        <dd>
          {formatRange(toDisplayRange("energy", impacts.energy))}
          {guessed ? `, ${Math.round(guessed.low * 100)}–${Math.round(guessed.high * 100)}% of it on guessed models` : ""}
        </dd>
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
  const models = listEcologitsModels();
  const guessed = models.filter(([, model]) => model.basis === "guessed").length;
  return (
    <main className="methodology">
      <p className="method-kicker">Methodology</p>
      <h1>AI Energy &amp; Water Use</h1>
      <p className="method-lead">
        How the figures on the screen are made, and how uncertain they are. Tap any line to open it.
      </p>

      <ul className="method-glance">
        <li>
          <strong>Counted</strong> — the text, speech and listening the AI providers bill for. Visitors' input,
          for which the provider reports nothing, is counted as the time the microphone is open.
        </li>
        <li>
          <strong>Estimated</strong> — energy, water and carbon, with the open method{" "}
          <a href="https://ecologits.ai/latest/methodology/llm_inference/">EcoLogits</a> {ECOLOGITS_VERSION}. Shown as
          ranges, because nobody knows the exact figure.
        </li>
        <li>
          <strong>Guessed</strong> — {guessed} of the {models.length} models are described by nobody: their makers
          publish no size, so the estimate rests on our analogy.
        </li>
        <li>
          <strong>Floors</strong> — training, building, idle capacity and more are left out, so the true cost is
          higher.
        </li>
        <li>
          <strong>Measured</strong> — the room's own electricity, from the plugs. Not AI, and so far far larger than
          the AI's estimated electricity: the AI's cost is paid elsewhere.
        </li>
      </ul>

      <section>
        <h2>Ranges</h2>
        <p>
          The two ends of a range come from the smallest and largest plausible inputs: model size, data-centre
          efficiency, and for Mistral whether it runs in Sweden or the US. The middle is no more likely than any
          other point. Kinds of chip, how many requests share them and the hardware's making are fixed, so the true
          range is wider still.
        </p>
      </section>

      <section>
        <h2>The current meeting</h2>
        <p>
          It starts when a visitor begins talking to the guide that sets it up, and counts each reply only once it
          has been played. After three quiet minutes it is shown as the last meeting.
        </p>
      </section>

      <section>
        <h2>The models</h2>
        <p>Where each is assumed to run, and whether anyone has described it.</p>
        {models.map(([id, model]) => <ModelEntry key={id} id={id} model={model} />)}
      </section>

      <Training />
      <Outside />
      <Minerals />
      <AroundTheWorld />
      <WhosCounting />
      <AllCouncils />
      <References />

      <footer className="method-footer">
        <p>
          EcoLogits is open source (MPL-2.0). Model sizes it lacks or lists incorrectly are taken from the sources
          given with each model. Published figures checked October 2026.
        </p>
      </footer>
    </main>
  );
}
