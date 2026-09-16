# AI footprint meter — vision and roadmap

**Status:** Phases 1 (server usage), 2 (realtime usage + installation ID) and a first version of
4 (meter screen) implemented, plus the EcoLogits table from phase 3. Remaining: phase 3 (training,
room, methodology page), tuning phase 4 on the real display, phase 5.

**Goal:** A second screen in the museum installation that shows what the council costs the
planet while it speaks for the forest — energy, water, emissions and minerals — and makes
visible that most of that cost lands somewhere else, on someone else.

---

## Vision

The council uses AI to give the forest a voice, and AI is part of what destroys forests. The
meter holds that contradiction up next to the council instead of hiding it.

It is an artwork, not an audit. The numbers do not have to be exact, but they must be
**reasonable, sourced and defensible**, and must say out loud how uncertain they are.

### Framing: visible vs invisible

"Room vs cloud" is the starting point, but the honest split is **what you can see vs what you
cannot**:

| Visible (here) | Invisible (elsewhere) |
|---|---|
| Electricity of the Mac, screens, speakers | Electricity of GPUs in data centres, on grids we do not choose |
| | Water evaporated for cooling and power generation |
| | Emissions of those grids |
| | Minerals mined for the GPUs, servers — *and* for the Mac in the room |
| | The one-off cost of training the models |

Expect the room's electricity per hour to be comparable to, or larger than, the inference
energy of the meetings. That is fine — the externalised burden is mostly in water, minerals,
training and place, not in watt-hours. Don't let an energy-only comparison accidentally argue
that AI is harmless.

A second, useful asymmetry: the room can be **measured**; the cloud can only be **estimated**,
because providers don't disclose where or on what they ran. Show the room as a number and the
cloud as a range. The uncertainty is part of the message.

### What the screen could show (to be designed)

- **This meeting** — live-ticking totals while the council speaks.
- **Since the installation opened** / **all councils everywhere** — where the numbers become
  tangible.
- **A scale** — one rotating concrete comparison per metric (litres, phone charges, …).
- **Uncertainty** — low/central/high, not a single false-precise number.
- **Models and places** — which models answered, and where they probably run.
- **Speculative:** a live map where data-centre regions "light up" per call; mining sites
  for the minerals embodied in the hardware.
- **Training** — the inherited cost of the models the council stands on.
- A QR code to a methodology page with every coefficient and source.

Screen: VSDISPLAY 12.8" 2880×864, mounted portrait (864×2880). Rotate in macOS display
settings or in CSS — decide once the screen arrives.

---

## Principles

1. **Store raw usage, convert at display time.** Every event stores the provider's own unit
   (tokens, characters, audio seconds). The footprint comes from a pinned EcoLogits version
   plus our own sourced table for what it lacks; changing either never needs a data migration.
2. **Count everything, tag installations.** Every AI call from every client and meeting is
   recorded. Installation ID is an optional tag, not a filter at write time.
3. **Record what we are billed for.** Only provider-reported usage (plus derivable units like
   audio duration). No speculative "mic was open" estimates. Failed/retried attempts that
   return no usage are not counted.
4. **One container.** The meter is served by the existing council server; live updates come
   straight from the process that records the usage (Mongo on server-3 is standalone — no
   change streams — so a separate service would have to poll).
5. **Isolated client code.** The meter is its own Vite entry point and imports nothing from the
   council app.
6. **Sources for every coefficient.** No number on screen without a citation in the
   methodology table.

---

## Where usage comes from

| Feature | Call site | Provider → model (current config) | Stored measures |
|---|---|---|---|
| Council dialogue, chair (`dialogue`), summary (`summary`) | `ConversationService` → recorded per attempt in `DialogGenerator.completeWithRetry` | Inworld router → `mistral/mistral-large-3` | input/output/cached/reasoning tokens, `request_seconds` |
| Speaker classifier (`classifier`) | `SpeakerClassifierBase.requestSpeakerClassifierCompletion` | Inworld router → `google-ai-studio/gemini-2.5-flash` | tokens, `request_seconds` |
| Voices (`tts`) — Inworld | `TTSProviders.generateInworldAudio` → recorded per chunk in `AudioSystem` | `inworld-tts-1.5-max` / `inworld-tts-2` | `characters` (provider-reported), `audio_seconds`, `request_seconds` |
| Voices (`tts`) — ElevenLabs (used on `forest-leo`) | `generateElevenLabsAudio` | `eleven_flash_v2_5` | `characters` sent, `audio_seconds`, `request_seconds`, `region` from `x-region` header |
| Voices (`tts`) — OpenAI (not used in current data) | `generateOpenAIAudio` | `gpt-4o-mini-tts` | `characters`, `audio_seconds` |
| Whisper timing fallback (`subtitle-timing`) | `AudioSystem` whisper branch | `whisper-1` | `audio_seconds` |
| Setup agent, meta agent (`setup-agent`, `meta-agent`) | client ↔ Inworld realtime (WebRTC); `response.done` usage → `POST /api/usage/realtime` | `gemini-2.5-flash` + `inworld-tts-1.5-max` / `inworld-tts-2` + `soniox/stt-rt-v4` | one record per part: LLM tokens (incl. reasoning), TTS `characters` + `audio_seconds`, STT `audio_seconds` |
| Human input (`human-input`) | same route; any data-channel event carrying `usage` | `gemini-2.5-flash` + `soniox/stt-rt-v4` | as above — **shape unverified**, see below |

Cached audio (replays) is not re-recorded — only freshly generated audio counts.
Retried requests that fail without a response are not counted.

**Verified response shapes (probed 2026-09-16):**
- Inworld router chat completions: OpenAI-style `usage`
  (`prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`), plus
  `metadata.attempts[].time_to_first_token_ms` and `metadata.total_duration_ms`.
- Inworld TTS: `usage: { processedCharactersCount, modelId }`.
- ElevenLabs: no usage body; responses carry an `x-region` header (e.g. `europe-west4`, Google
  Cloud Netherlands) — a real data-centre location signal.
- Inworld realtime `response.done` → `response.usage` (setup agent, logged 2026-09-16):
  `{ input_tokens, output_tokens, input_token_details, output_token_details: { reasoning_tokens },
  llm: { model }, tts: { model, characters, audio_seconds }, stt: { model, audio_seconds } }`.
  Parts appear only when used: a cancelled response can carry just `stt`.
- Human input (text-only session, `create_response: false`) has no `response.done`. The client
  forwards `usage` from any event and logs it as `[HI] usage`; check a dev log to confirm STT
  usage arrives, otherwise human-input transcription goes uncounted.

## Data model

```ts
// shared/UsageTypes.ts (implemented)
type UsageFeature =
  | "dialogue" | "summary" | "classifier" | "tts" | "subtitle-timing"
  | "setup-agent" | "meta-agent" | "human-input";

type UsageMeasure =
  | "input_tokens" | "output_tokens" | "cached_input_tokens" | "reasoning_tokens"
  | "input_audio_tokens" | "output_audio_tokens"
  | "characters" | "audio_seconds" | "request_seconds";

interface UsageEvent {
  ts: Date;
  source: "server" | "client";
  feature: UsageFeature;
  provider: string;            // who we called: "inworld" | "elevenlabs" | "openai"
  model: string;               // as requested/reported, e.g. "mistral/mistral-large-3"
  measures: Partial<Record<UsageMeasure, number>>;
  region?: string;             // when the provider tells us
  meetingId?: number;
  installationId?: string;
}
```

Collections:
- `usage_events` — append-only log, indexed on `ts`, `installationId`, `meetingId`.
- `usage_totals` — one doc per scope × provider × model
  (`_id: "global|inworld|mistral/mistral-large-3"`, `installation:<id>|…`), raw measures and
  request count summed with `$inc`. Keeps the meter's initial load cheap.

`request_seconds` is stored because EcoLogits needs request latency alongside output tokens.

Conversion (phase 3) is a function over the totals:

```ts
estimateFootprint(totals, coefficients) → {
  energyWh, waterMl, co2eG, mineralsMgSbEq   // each { low, central, high }
}
```

Language models go through EcoLogits; speech models and training use our own sourced ranges
(see Methodology). Table-driven tests cover the mapping and arithmetic, never the coefficient
values themselves.

---

## Methodology: reference points found (Sept 2026)

These anchor the coefficient table. Re-check before an opening.

| Source | Scope | Figures |
|---|---|---|
| **Mistral AI — Large 2 lifecycle analysis** (with Carbone 4 / ADEME, July 2025) | Inference per 400-token response, incl. hardware manufacturing; excl. user devices | **1.14 gCO₂e, 45 mL water, 0.16 mg Sb eq** |
| same | Training + 18 months of use of Mistral Large 2 | **20.4 ktCO₂e, 281,000 m³ water, 660 kg Sb eq** |
| **Google — "Measuring the environmental impact of delivering AI at Google scale"** (Aug 2025, arXiv 2508.15734) | Median Gemini Apps text prompt, "comprehensive" boundary (accelerators + host + idle + PUE); on-site water only | **0.24 Wh, 0.03 gCO₂e, 0.26 mL**. Narrow boundary (accelerators only): 0.10 Wh, 0.12 mL |
| Epoch AI / OpenAI statements | Typical GPT-4o query | ~0.3 / 0.34 Wh |
| **EcoLogits** (GenAI Impact, open source) | LLM inference, LCA-based: energy, GWP, ADPe (minerals), primary energy, water | Energy per output token `α·e^(βB)·P_active + γ` from ML.ENERGY H100 data; per-provider PUE/WUE (e.g. Mistral 1.16 / 0.09, Sweden); embodied H100 0.00895 kg Sb eq, server 0.37 kg Sb eq, 3-year lifetime. Excludes training |
| "How Hungry is AI?" (arXiv 2505.09598) | Benchmarks energy/water/carbon across 30 models | Order-of-magnitude spread by model size; reasoning models >30 Wh per long prompt |
| G7 French Presidency overview (May 2026) | Catalogue of standards: ISO/IEC TR 20226, ITU-T L.1801, IEEE P7100, AFNOR Spec 2314, AI Energy Score, ML.ENERGY | Use to cite our method's lineage |

### EcoLogits as the footprint engine

EcoLogits is the right engine: open LCA methodology, ranges built in, energy + GWP + ADPe
(minerals) + primary energy + water, maintained model repository with sources.

- **Python library is active:** v0.11.1 (July 2026). Its model repository
  (`ecologits/data/models.json`, 344 models) includes `google_genai/gemini-2.5-flash`
  (MoE, 440B total, 44–132B active), `mistralai/mistral-large-2512`,
  `openai/gpt-4o-mini-tts` and `gpt-4o-mini-transcribe`, plus per-country electricity mixes.
  Entry point: `llm_impacts(provider, model_name, output_token_count, request_latency,
  electricity_mix_zone)`.
- **The TypeScript port is stale:** `@genai-impact/ecologits.js` 2.0.5 (Dec 2024) pins model
  data to EcoLogits 0.5.0 and fetches a CSV from GitHub at import time. Not usable as is.
- **Implemented: export at dev time, no Python at runtime.** EcoLogits' LLM model is linear
  per request: `impact = a·output_tokens + b·generation_seconds`, where
  `generation_seconds = min(request_seconds, output_tokens × seconds_per_token + ttft)` and
  `a`, `b` are constant per model (parameter count, GPU count, data-centre PUE/WUE,
  electricity mix).
  - `scripts/ecologits/export.py` reads the constants off EcoLogits' own DAG for each model in
    its `MODELS` table and writes `shared/footprint/ecologits.json`: version, low/high
    coefficients per impact (energy kWh, GWP kgCO₂eq, ADPe kgSbeq, PE MJ, water L),
    data-centre zone, parameters, assumptions, warnings, sources — plus golden samples from
    EcoLogits' public `llm_impacts` / `compute_llm_impacts`.
  - `shared/footprint/ecologits.ts`: `findEcologitsModel(provider, model)` and
    `estimateImpacts(model, { measures, requests })` over raw usage totals.
  - `server/tests/footprintEcologits.test.ts`: the evaluator reproduces every golden sample
    (relative error ~1e-11), and every model in `global-options.json` has an entry.
  - The JSON is committed; `tsc` copies it into `dist`, so the Docker image needs nothing new.
  - **Commands (in `server/`, need [uv](https://docs.astral.sh/uv/)):**
    - `npm run footprint:check` — compares the committed EcoLogits version with the latest on
      PyPI; exits 1 when a newer release exists.
    - `npm run footprint:update` — regenerates with the latest release (or
      `-- --version X`), prints energy per 400 units before → after. Review the JSON diff and
      run the tests; a formula change in EcoLogits that breaks linearity fails the golden test.
    - Adding a model: add it to `MODELS` in `export.py`, run `footprint:update`.
  - Speech models use the same EcoLogits maths with our inputs, written into the JSON:
    Inworld TTS-1.5-Max 8.8B / Mini 1.6B / TTS-2 1.6–8.8B, 50 tokens per audio second, Google
    data-centre profile (USA); ElevenLabs Flash v2.5 assumed 1.6–8.8B on the Google profile
    with the Dutch electricity mix (from `x-region: europe-west4`). TTS calls record
    `request_seconds`, so EcoLogits' LLM latency regression (which would imply ~2.3 s of GPU
    time per second of speech) is capped by the measured time.
- **First run (0.11.1), per 400-token response:** Mistral Large 3 ≈ 0.21–0.24 Wh, ~1.3–1.4 mL
  water, 8–15 mg CO₂e (Swedish grid assumed); Gemini 2.5 Flash ≈ 0.46–0.89 Wh, 1.9–3.6 mL,
  0.18–0.36 g CO₂e (US grid). Compare Mistral's own LCA: 1.14 g CO₂e and 45 mL — a much wider
  boundary. Worth showing both. Latency dominates the embodied (minerals) share, and our
  `request_seconds` includes network time, so it errs high there; the `min(…, tokens/tps + ttft)`
  cap limits that.
- EcoLogits is MPL-2.0; credit it on the methodology page.
- **Mistral Large 3 architecture — corrected (verified 2026-09-16):** EcoLogits 0.11.1 *and* its
  `main` branch list `mistral-large-2512` as 123B dense, with sources pointing at Mistral Large 2
  (`mistral-large-2407`) — a copied entry. Mistral's announcement, docs and Hugging Face model card
  all give **675B total / 41B active, mixture-of-experts**, trained on 3,000 H200s. No open issue
  upstream. `export.py` overrides the parameters for this model and adds a **quantization range of
  8–16 bits** (weights are published in FP8 and BF16), since EcoLogits sizes the GPU fleet by
  weight memory: 16–32 GPUs. Effect: 0.24 Wh → **0.60–1.20 Wh per 400 tokens**. Golden samples for
  overridden models come from EcoLogits' `compute_llm_impacts` with the corrected inputs.
  To do: report upstream to mlco2/ecologits.
- EcoLogits excludes training; training stays a separate block (below).

### Speech

- **Inworld publishes nothing about energy or location** for TTS, STT or realtime (searched
  docs, pricing, blog). It runs on Google Cloud (Google customer case study); region
  unpublished.
- **But its TTS is a language model:** the TTS-1 technical report (arXiv 2507.21138) describes
  autoregressive transformer SpeechLMs — TTS-1 **1.6B** and TTS-1-Max **8.8B** parameters —
  generating **50 audio tokens per second** of speech. So Inworld TTS fits EcoLogits' LLM
  formula: `output_tokens ≈ audio_seconds × 50`, parameters 1.6–8.8B. TTS-1.5 and TTS-2 sizes
  are unpublished; use the range and mark it as assumed.
- **ElevenLabs Flash, Soniox STT:** no published sizes or energy data. Estimate by analogy to a
  small model per audio second, widest range, labelled as such.

**What this means for us:**
- **Mistral Large 3 is our dialogue model** — Mistral's own lifecycle analysis is the most direct,
  defensible anchor, and the only published per-response *mineral* figure.
- **Water differs ~170× between sources** (45 mL vs 0.26 mL) purely from boundary: Mistral
  includes off-site electricity generation and manufacturing; Google counts on-site cooling
  only. Show this as the range, and say why.
- **Speech (TTS/STT) has almost no published per-second figures.** Estimate via GPU-seconds
  (EcoLogits-style: GPU power × PUE × realtime factor) and label as "estimated by analogy".
- **Training:** amortising per request needs the model's lifetime request count, which no
  provider publishes. Proposal: show training as a whole, inherited cost ("the models this
  council stands on cost at least …"), not a per-meeting share. Only Mistral publishes this;
  others are marked unknown.

**Minerals, made tangible** (sources below): Sb eq is meaningless to visitors. Pair the number with named
materials and places from the hardware supply chain: tantalum (DRC, Rwanda), cobalt (DRC),
gallium and germanium (China), copper (Chile), plus water-intensive chip fabs (Taiwan).
Sources to use: FP Analytics "AI and the Critical Minerals Crunch" (2025), WEF data-centre
materials (Dec 2025), USGS mineral commodity summaries. Pick sites with documented,
citable impacts on local communities — careful wording, no overclaiming about which mine fed
which GPU.

**Places, as far as they are knowable:**
| Provider | What is public |
|---|---|
| Inworld (router, TTS, realtime) | Runs on Google Cloud; region not published |
| Google AI Studio (Gemini) | Google global fleet; no per-request region |
| Mistral | EcoLogits assumes Microsoft Azure, Sweden; Mistral also operates its own compute in France |
| ElevenLabs | US by default; EU/India/Singapore residency on enterprise plans |
| Soniox | US by default; EU and Japan regions available |

Tracing IPs won't locate the GPUs: API endpoints sit behind anycast/CDN front-ends, so
geolocation returns the nearest edge. The one partial exception is the realtime WebRTC media
server (ICE candidates), which shows where audio is terminated, not where inference ran.
Plan: show **"probable regions"** with the reasoning on the methodology page, and ask
providers directly — their answer (or refusal) is itself content.

---

## Roadmap

### Phase 1 — Record everything (server) ✅

- Probed one real response per provider (see "Verified response shapes").
- `shared/UsageTypes.ts`; `server/src/services/UsageService.ts`: `recordUsage(record)` inserts
  the event, `$inc`s global + installation totals, notifies `onUsageRecorded` listeners.
  Never throws; callers fire and forget. No-op without a database.
- `ConversationService` returns `usage` (provider, model, parsed tokens, request seconds);
  `DialogGenerator` records every attempt. Classifier records its own call. `AudioSystem`
  records each freshly generated TTS chunk and Whisper timing runs.
- Meetings accept and store `installationId` (`POST /api/meetings`).
- Tests: `tests/usage.integration.test.ts` (totals, empty usage, listeners, usage parser
  table), `ConversationService.test.ts` (usage per route), meetings HTTP (installation tag).

### Phase 2 — Client-reported realtime usage + installation ID ✅

- `#staff` → Installation panel: **Installation ID** field (`councilInstallationId` in
  localStorage; a stored setting, not a mode capability). Sent on meeting creation and on
  setup-agent bootstrap; meeting sessions (meta agent, human input) take it from the meeting.
- `POST /api/realtime/bootstrap` returns a `usageToken` (`server/src/api/realtimeUsage.ts`):
  random, in memory, 4 h TTL, bound to the feature and the meeting/installation tags; the
  registry is capped at 10,000 grants.
- `POST /api/usage/realtime` `{ usageToken, responses }`: unknown/expired token → 403; at most
  50 responses per report and 2,000 per token; each part parsed and clamped by
  `parseRealtimeUsage` (e.g. ≤ 50,000 characters, ≤ 3,600 audio seconds per response).
- Client `realtime/realtimeUsageReporter.ts`: one POST per completed response, sent immediately
  so the meter moves while the agent speaks (a few small requests a minute — no socket
  needed). `fetch` with `keepalive`; fire and forget — not a reconciled socket intent
  (RESILIENCE.md does not apply).
- Tests: server `realtimeSessionApi.integration.test.ts` (tagging for setup/meta sessions,
  forged token, clamping); client `realtimeUsageReporter.test.ts`.

### Phase 3 — Footprint function + methodology

- ✅ EcoLogits export script, committed table, TS evaluator, golden-sample test, `footprint:check`
  / `footprint:update` (see "EcoLogits as the footprint engine").
- ✅ `inworld|soniox/stt-rt-v4`: 0.6–2B (Parakeet TDT 0.6B to Whisper large-v3 1.55B, rounded up),
  50 tokens per audio second, EcoLogits' generic US cloud profile. Estimate by analogy, labelled.
- ✅ Estimation rule for summed totals (`estimateImpacts`): measured `request_seconds` is **not**
  used, because the same model is called with it (server) and without it (realtime), so a summed
  request time would cover only part of the tokens. Generation time comes from EcoLogits'
  latency model (published tokens/s where known); for audio models it is capped at the audio's
  length, since streamed speech and transcription run at least as fast as real time.
  `estimateEcologitsImpacts` is the exact EcoLogits computation the golden test checks.
- Known limitation, inherited from EcoLogits: only output tokens drive energy. Input (prefill)
  is not modelled, which matters for the realtime agents (~3,000 input tokens per turn).
- ✅ Training block (`shared/footprint/training.ts`): published figures only, shown whole, never
  per request. Mistral Large 2 LCA (training + 18 months: 20.4 kt CO₂e, 281,000 m³, 660 kg Sb eq)
  as the closest figure for Large 3 (no Large 3 LCA; trained on 3,000 H200s, 5.5× the parameters).
  Google, Inworld, ElevenLabs, Soniox: "not disclosed" — named on screen.
- ✅ Methodology page: `/meter/methodology` (dev: `/meter.html?page=methodology`), reached by a QR
  code in the meter footer. Generated from `ecologits.json` and `training.ts`: what is counted,
  how EcoLogits works, per model role/location/size/impacts per 400 tokens or per minute of audio
  with assumptions, warnings and sources; training; what is left out; Mistral's and Google's own
  figures for contrast; EcoLogits credit (MPL-2.0).
- Remaining: room figure (smart plug, below).

**Room electricity — implemented (any number of plugs):**
- Hardware: Shelly Plug S Gen3 ×3 (ordered 2026-09). Plug M Gen3 / Plug PM Gen3 / Power Strip 4 Gen4
  use the same API. Projector BenQ TH682ST ≈ 244 W typical, 320 W max.
- Each plug runs `scripts/shelly/room-power.js`: every 5 s, `POST /api/room-power`
  `{ installationId, deviceId, label, watts, energyCounterWh }` with `X-Room-Power-Key`
  (`COUNCIL_ROOM_POWER_KEY`; unset → 503). Separate from the bridge key: a plug's script is readable
  on the museum LAN.
- Server (`RoomPowerService`): latest reading per plug in `room_power`; energy accumulated from the
  plug's counter in one atomic update, surviving counter resets. Pushed as `room-power` on `/meter`;
  part of the meter snapshot.
- Meter: **In this room, measured** — power now (W), electricity so far, one line per plug; a plug
  silent for 60 s shows "no signal" and its watts drop out. Demo mode fakes three plugs.
- Setup steps: MUSEUM.md → "Room power plugs". Needs museum Wi-Fi without a login page; fallback if
  not: the button bridge polls plugs on the LAN (not built).
- Our own table only for what EcoLogits lacks: Inworld TTS (via its SpeechLM size and 50
  tokens/s), ElevenLabs, Soniox, training. Each entry has a source and a range; unknown models
  fall back to the widest range rather than failing.
- Room figure: a per-installation constant watts (measured once with a plug power meter)
  × uptime while the meter page is open. Live smart-plug readings: not planned — revisit only
  if the constant feels wrong.
- Training figures as a separate, non-amortised block.
- Methodology page (static, in the meter entry) listing every coefficient and source.

### Phase 4 — Meter screen (first version ✅, to tune on the display)

- **Server** (`server/src/api/meterRoutes.ts`): `GET /api/meter?installation=<id>` returns a
  `MeterSnapshot` (`shared/MeterTypes.ts`) — raw totals for all councils, the installation, and
  the installation's latest meeting (aggregated from `usage_events`). The `/meter` socket.io
  namespace pushes every recorded usage to every meter. `/meter` serves `client/dist/meter.html`.
- **Client** (`client/meter.html` → `client/src/meter/`): its own Vite entry and bundle (~44 kB),
  no council imports. `useMeterFeed` refetches the snapshot on every socket (re)connect, then
  folds pushed events in with `applyUsageEvent`; `footprintOf` sums EcoLogits estimates per
  scope; `toDisplayRange` picks readable units (Wh/kWh, mL/L, mg/g CO₂e, µg/mg Sb eq).
  NumberFlow animates the values.
- Screen v1: "This meeting" (large, once the installation has a meeting), "This installation",
  "All councils" — energy, water, carbon, minerals as midpoint + low–high range; the models
  answering and their assumed data-centre countries; EcoLogits version in the footer.
- "This meeting" starts when the meeting is created; setup-agent usage before it counts toward
  the installation, not the meeting.
- **Preview:** `cd client && npm run dev`, then open `/meter.html?demo` (TEMPORARY fake feed, marked
  on screen) or `/meter.html?installation=<id>` against a dev server. Production:
  `https://<host>/meter?installation=<id>`. `?rotate=90` / `?rotate=-90` rotates the page if
  macOS can't rotate the display.
- Still to do: tune layout and copy on the VSDISPLAY; comparisons/scale; training block; room
  figure; methodology page + QR; kiosk instructions in MUSEUM.md (second Chrome instance with
  its own `--user-data-dir`, `--window-position` on display 2, `--kiosk`); remove `?demo`.

### Phase 5 — Speculative / later

- Live map: probable data-centre regions pulse per call.
- Mining sites layer for embodied minerals.
- Backfill historical meetings from stored transcripts and audio durations.
- Ask providers for region and per-request data; publish the replies.

---

## Open questions

- Scope of "everywhere": all councils on this deployment only, or foods + forest combined?
- Which comparisons per metric? (Pick ones that are true at both small and large scale.)
- Training block: Mistral only (published), or also rough estimates for Gemini Flash / TTS
  models clearly marked as such?
- Which mining sites / communities to name, and who reviews that wording?
- Room constant: which devices count as "the installation" (projector/TV, speakers, meter
  screen, Mac)?

---

## Sources

Footprint data and methodology
- Mistral AI, "Our contribution to a global environmental standard for AI" (Large 2 LCA, July 2025) —
  https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai
  (summary: https://www.deeplearning.ai/the-batch/french-ai-startup-discloses-full-lifecycle-consumption-and-emissions-for-mistral-large-2)
- Google, "Measuring the environmental impact of delivering AI at Google scale" (Aug 2025) —
  https://arxiv.org/abs/2508.15734 ·
  https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference
- EcoLogits methodology — https://ecologits.ai/latest/methodology/llm_inference/ ·
  repository https://github.com/mlco2/ecologits (v0.11.1, models in `ecologits/data/models.json`)
- EcoLogits.js (stale TS port) — https://www.npmjs.com/package/@genai-impact/ecologits.js
- "How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference" —
  https://arxiv.org/abs/2505.09598
- G7 French Presidency, "Overview of voluntary initiatives … energy and resource requirements of
  AI models" (May 2026) —
  https://www.entreprises.gouv.fr/files/files/Actualites/2026/g7/overview-measurement-monitoring-energy-resource-ai-models.pdf
- ML.ENERGY leaderboard (EcoLogits' energy data) — https://ml.energy/
- AI Energy Score — https://huggingface.co/AIEnergyScore

Speech models
- Inworld, "TTS-1 Technical Report" (1.6B / 8.8B params, 50 tokens/s) — https://arxiv.org/abs/2507.21138
- Inworld TTS API (`usage.processedCharactersCount`) — https://apis.io/apis/inworld-ai/inworld-tts-api/
- Inworld on Google Cloud — https://cloud.google.com/customers/inworld
- Inworld pricing (billing units) — https://inworld.ai/pricing

Places
- Soniox data residency (US default; EU, Japan) — https://soniox.com/docs/data-residency
- ElevenLabs data residency (US default; EU, India, Singapore) —
  https://elevenlabs.io/docs/overview/administration/data-residency

Minerals and supply chain
- FP Analytics, "Artificial Intelligence and the Critical Minerals Crunch" (2025) —
  https://fpanalytics.foreignpolicy.com/2025/07/18/artificial-intelligence-critical-minerals-supply-chains/
- World Economic Forum, "Scaling metals to secure the data centre materials backbone" (Dec 2025) —
  https://www.weforum.org/stories/2025/12/securing-data-centre-materials/
- China, the DRC and artisanal cobalt mining 2000–2020 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10293843/
- USGS Mineral Commodity Summaries — https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries
