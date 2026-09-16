import type { ReactElement } from "react";
import {
  ECOLOGITS_VERSION,
  estimateImpacts,
  listEcologitsModels,
  type EcologitsModel,
} from "@shared/footprint/ecologits";
import { TRAINING_DISCLOSURES } from "@shared/footprint/training";
import { toDisplayRange, type DisplayRange } from "./meterState";
import { MODEL_ROLES, zoneName } from "./modelInfo";

/**
 * The methodology page behind the meter's QR code: every assumption and source the numbers
 * rest on, generated from the same table the meter computes with, so the two cannot drift.
 */

function formatRange(range: DisplayRange): string {
  const digits = (n: number) => n.toPrecision(2);
  return range.high > range.low * 1.001
    ? `${digits(range.low)}–${digits(range.high)} ${range.unit}`
    : `${digits(range.central)} ${range.unit}`;
}

function formatParameters(model: EcologitsModel): string {
  const range = ([low, high]: [number, number]) => (low === high ? `${low}B` : `${low}–${high}B`);
  const active = range(model.activeParameters);
  const total = range(model.totalParameters);
  return active === total ? `${total} parameters` : `${total} parameters, ${active} active per token`;
}

function ModelEntry({ id, model }: { id: string; model: EcologitsModel }): ReactElement {
  const isAudio = model.usageMeasure === "audio_seconds";
  const reference = isAudio
    ? { label: "per minute of audio", measures: { audio_seconds: 60 } }
    : { label: "per 400-token answer", measures: { output_tokens: 400 } };
  const impacts = estimateImpacts(model, { measures: reference.measures, requests: 1 });
  const name = id.split("|")[1];

  return (
    <article className="method-model">
      <h3>{name}</h3>
      <p className="method-role">{MODEL_ROLES[id] ?? "Used by the council"}</p>
      <dl>
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
        <dt>Minerals {reference.label}</dt>
        <dd>{formatRange(toDisplayRange("adpe", impacts.adpe))}</dd>
      </dl>
      {model.assumptions.length > 0 ? (
        <ul className="method-assumptions">
          {model.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
        </ul>
      ) : null}
      {model.warnings.length > 0 ? (
        <p className="method-warning">EcoLogits notes: {model.warnings.join(" ")}</p>
      ) : null}
      <Sources urls={model.sources} />
    </article>
  );
}

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

function Training(): ReactElement {
  return (
    <section>
      <h2>The inherited cost: training</h2>
      <p>
        Before a model can speak it has to be trained, on thousands of GPUs, in data centres built for it. That
        cost is paid once and shared by everyone who ever uses the model, so it is shown here as a whole — no
        provider publishes how many requests a model serves, so it cannot be divided per meeting.
      </p>
      {TRAINING_DISCLOSURES.map((entry) => (
        <article className="method-model" key={entry.model}>
          <h3>{entry.model}</h3>
          <p className="method-role">{entry.maker}</p>
          {entry.disclosed ? (
            <>
              <p>{entry.disclosed.scope}</p>
              <dl>
                <dt>Carbon</dt>
                <dd>{formatRange(toDisplayRange("gwp", { low: entry.disclosed.gwpKgCo2e, high: entry.disclosed.gwpKgCo2e }))}</dd>
                <dt>Water</dt>
                <dd>{formatRange(toDisplayRange("wcf", { low: entry.disclosed.waterL, high: entry.disclosed.waterL }))}</dd>
                <dt>Minerals</dt>
                <dd>{formatRange(toDisplayRange("adpe", { low: entry.disclosed.adpeKgSbEq, high: entry.disclosed.adpeKgSbEq }))}</dd>
              </dl>
              {entry.disclosed.trainingHardware ? <p>{entry.disclosed.trainingHardware}</p> : null}
            </>
          ) : (
            <p className="method-undisclosed">Not disclosed.</p>
          )}
          <p>{entry.note}</p>
          {entry.disclosed ? <Sources urls={entry.disclosed.sources} /> : null}
        </article>
      ))}
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
        the chips it runs on. Most of it is paid far from this room. The screen next to the council estimates that
        cost as it happens. This page explains how, and how uncertain the numbers are.
      </p>

      <section>
        <h2>What is counted</h2>
        <ul>
          <li>Every call the council makes to an AI model, with the usage the provider bills for: tokens of text, characters and seconds of synthesised speech, seconds of recognised speech.</li>
          <li>Voice conversations run directly between the visitor's browser and the provider; the browser reports their usage as each answer completes.</li>
          <li>"This meeting" starts when the meeting is created. "All councils" includes every council, everywhere, since counting began.</li>
        </ul>
      </section>

      <section>
        <h2>How usage becomes energy, water, carbon and minerals</h2>
        <p>
          The estimates use <a href="https://ecologits.ai/latest/methodology/llm_inference/">EcoLogits</a>{" "}
          {ECOLOGITS_VERSION}, an open life-cycle assessment method by the non-profit GenAI Impact. From a model's size
          it estimates how many GPUs a request occupies and for how long, the electricity that takes (including data
          centre overhead), the water and emissions of the local electricity grid and cooling, and a share of the
          emissions and minerals embodied in manufacturing the servers.
        </p>
        <p>
          Providers do not publish their models' sizes, hardware or locations, so every figure is a range: the low
          and high ends follow from the uncertainty in those inputs. The screen shows the middle of the range large
          and the range beneath it.
        </p>
      </section>

      <section>
        <h2>The models</h2>
        {listEcologitsModels().map(([id, model]) => <ModelEntry key={id} id={id} model={model} />)}
      </section>

      <Training />

      <section>
        <h2>What these numbers leave out</h2>
        <ul>
          <li>Reading: EcoLogits models the energy of generating output, not of reading the input. The voice agents read thousands of tokens of context per answer.</li>
          <li>Requests that failed and were retried, and voice usage the browser could not report.</li>
          <li>The network, the visitor's devices and the electricity of this room.</li>
          <li>Training, except where shown above as a whole.</li>
        </ul>
      </section>

      <section>
        <h2>Other published figures</h2>
        <p>
          Providers' own studies draw their boundaries differently, and the results differ by orders of magnitude:
        </p>
        <ul>
          <li>
            Mistral AI's life-cycle analysis of Mistral Large 2: 1.14 g CO₂e, 45 mL of water and 0.16 mg Sb eq per
            400-token answer, including hardware manufacturing and the water used to generate electricity.{" "}
            <Sources urls={["https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai"]} />
          </li>
          <li>
            Google, for the median Gemini text prompt: 0.24 Wh, 0.03 g CO₂e and 0.26 mL of water — cooling water
            only, with Google's purchased clean energy counted against its emissions.{" "}
            <Sources urls={["https://arxiv.org/abs/2508.15734"]} />
          </li>
        </ul>
      </section>

      <footer>
        <p>
          EcoLogits is open source (MPL-2.0): <a href="https://github.com/mlco2/ecologits">github.com/mlco2/ecologits</a>.
          Model sizes that EcoLogits lacks or lists incorrectly are taken from the sources given with each model.
        </p>
      </footer>
    </main>
  );
}
