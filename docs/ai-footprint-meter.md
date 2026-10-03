# AI footprint meter

A second screen in the installation that shows what the council costs the planet while it
speaks for the forest — energy, water, carbon and minerals — and makes visible that most of
that cost lands somewhere else, on someone else.

**Status (2026-09-30):** built and running — recording, estimation, meter screen, methodology
page, training block and room power plugs. To do: tune the screen on the real display, and the
open items at the end. Installation setup lives in [MUSEUM.md](../MUSEUM.md) ("Venue and
footprint meter", "Meter screen", "Room power plugs").

---

## Vision

The council uses AI to give the forest a voice, and AI is part of what destroys forests. The
meter holds that contradiction up next to the council instead of hiding it.

It is an artwork, not an audit. The numbers do not have to be exact, but they must be
**reasonable, sourced and defensible**, and must say out loud how uncertain they are.

**Visible vs invisible.** The room's electricity can be *measured*; the cloud can only be
*estimated*, because providers don't disclose where or on what they run. So the room is shown
as a number and the cloud as a range. Expect the room's electricity per hour to rival the
meetings' inference energy: the externalised burden is mostly water, minerals, training and
place, not watt-hours. Don't let an energy-only comparison argue that AI is harmless.

| Visible (here) | Invisible (elsewhere) |
|---|---|
| Electricity of projector, computer, screens, speakers (measured) | Electricity of GPUs in data centres, on grids we do not choose |
| | Water evaporated for cooling and power generation |
| | Emissions of those grids |
| | Minerals mined for the GPUs and servers — and for the computer in the room |
| | The one-off cost of training the models |

---

## Principles

1. **Store raw usage, convert at display time.** Every event stores the provider's own units
   (tokens, characters, audio seconds). The footprint comes from a pinned EcoLogits version
   plus our own sourced inputs for what it lacks; changing either never needs a migration.
2. **Count everything, tag the venue.** Every AI call from every meeting and session is
   recorded; the venue is a tag, not a filter.
3. **Record what is billed.** Provider-reported usage plus derivable units (audio duration).
   Failed attempts that return no usage are not counted.
4. **One container, isolated client code.** The council server records usage and pushes it
   live; the meter is its own Vite entry and imports nothing from the council app.
5. **A source for every number** on screen, listed on the methodology page.

---

## How it works

### Recording usage

| Feature | Where it is recorded | Provider → model (current config) | Measures |
|---|---|---|---|
| Council dialogue, chair (`dialogue`), summary (`summary`) | `DialogGenerator.completeWithRetry`, every attempt | Inworld router → `mistral/mistral-large-3` | input / output / cached / reasoning tokens |
| Speaker classifier (`classifier`) | `SpeakerClassifierBase` | Inworld router → `google-ai-studio/gemini-2.5-flash` | tokens |
| Voices (`tts`) | `AudioSystem`, per freshly generated chunk | Inworld `inworld-tts-1.5-max` / `inworld-tts-2`; ElevenLabs `eleven_flash_v2_5` (forest); OpenAI `gpt-4o-mini-tts` (unused) | `characters`, `audio_seconds`; ElevenLabs also `region` from its `x-region` header |
| Whisper timing fallback (`subtitle-timing`) | `AudioSystem` | `whisper-1` | `audio_seconds` |
| Setup agent, meta agent | browser ↔ Inworld realtime; the client posts each `response.done` usage to `POST /api/usage/realtime` | `gemini-2.5-flash` + Inworld TTS + the session's transcription model | one event per part: LLM tokens, TTS characters + audio seconds, STT audio seconds |
| Human input | same route; the client times how long the microphone is open (`createMicTimeCounter`) and posts it as an `stt` part every 15 s while open and on closing | the session's transcription model (`soniox/stt-rt-v4`, `inworld/inworld-stt-1`) | `audio_seconds` |

  Human input is a transcription-only session (`create_response: false`): it never creates a
  response, so there is no `response.done`, and Inworld puts usage on no other event. A probe of
  the live API with the server's own session configs (October 2026) confirmed it: the human-input
  session sent no usage at all, while the agents' `response.done` carried
  `stt: { audio_seconds: 4.0 }` for 3.9 s of speech followed by 2 s of silence — the speech, not
  the stream. So the agents keep Inworld's figure, and human input counts the open microphone,
  which includes the silence while the button is held.

- **Storage:** `usage_events` only (`shared/UsageTypes.ts`): `{ ts, feature, provider, model,
  measures, region?, meetingId?, venueId? }`, indexed on `ts`, `venueId`, `meetingId`. Totals —
  everything, a venue, a meeting — are summed on read by `getUsageTotals(filter)`.
  `recordUsage` never throws and nobody awaits it: a meeting must not fail because usage could
  not be written.
- **Realtime reports** are authorised by a `usageToken` from `POST /api/realtime/bootstrap`
  (`server/src/api/realtimeUsage.ts`): random, in memory, 4 h, bound to the session's feature,
  meeting (or setup) and venue; at most 2,000 reports per token; each part clamped to plausible maxima by
  `parseRealtimeUsage`. Enough to stop casual inflation without accounts. The client
  (`client/src/realtime/realtimeUsageReporter.ts`) posts fire-and-forget with `keepalive`; it is
  not a reconciled socket intent, so RESILIENCE.md does not apply.
- **Venue:** chosen on `#staff` from `COUNCIL_VENUES` (see MUSEUM.md), sent on meeting creation
  and setup-agent bootstrap; meeting sessions take it from the meeting. Unknown venues are
  dropped (any well-formed id when no venues are configured).
- **Live updates:** `meterEvents` (`server/src/services/meterEvents.ts`) carries every recorded
  usage and plug reading to the `/meter` socket.io namespace.

Verified response shapes (probed 2026-09-16):
- Inworld router: OpenAI-style `usage` (`prompt_tokens`, `completion_tokens`,
  `prompt_tokens_details.cached_tokens`).
- Inworld TTS: `usage: { processedCharactersCount, modelId }`.
- ElevenLabs: no usage body; an `x-region` header (e.g. `europe-west4`, Google Cloud Netherlands).
- Inworld realtime `response.done`: `{ input_tokens, output_tokens, input_token_details,
  output_token_details: { reasoning_tokens }, llm: { model }, tts: { model, characters,
  audio_seconds }, stt: { model, audio_seconds } }`; parts appear only when used.

### Estimating the footprint

**EcoLogits** ([methodology](https://ecologits.ai/latest/methodology/llm_inference/), MPL-2.0) is
the engine: an open life-cycle method giving energy, carbon, minerals (ADPe) and water as
ranges. Its Python library is used at dev time only; the Node app never runs Python.

- EcoLogits' model is linear per request: `impact = a·output_tokens + b·generation_seconds`,
  with `a`, `b` constant per model. `scripts/ecologits/export.py` reads them off EcoLogits' own
  DAG for each model in its `MODELS` table and writes `shared/footprint/ecologits.json`, with
  assumptions, warnings, sources and golden samples from EcoLogits itself.
- `shared/footprint/ecologits.ts` evaluates the table; `server/tests/footprintEcologits.test.ts`
  checks it reproduces every golden sample and that every model in `global-options.json` has an
  entry.
- **Estimation rule** (`estimateImpacts`): generation time comes from EcoLogits' latency model
  (published tokens/s where known). For audio models it is capped at the audio's own length:
  streamed speech and transcription run at least as fast as real time, while EcoLogits' LLM
  regression would imply ~2.3 GPU-seconds per second of speech.
- **Our inputs where EcoLogits has none:**
  - Inworld TTS: autoregressive SpeechLMs, TTS-1 1.6B / TTS-1-Max 8.8B, 50 audio tokens per
    second (TTS-1 technical report); TTS-1.5 and TTS-2 sizes unpublished, so assumed within
    that range. Google data-centre profile (Inworld runs on Google Cloud, region unpublished).
  - ElevenLabs Flash v2.5: nothing published; assumed like Inworld's SpeechLMs, on the Google
    profile with the Dutch electricity mix (from `x-region: europe-west4`).
  - Soniox STT: nothing published; 0.6–2B (Parakeet TDT 0.6B to Whisper large-v3 1.55B), 50
    tokens per audio second, EcoLogits' generic US cloud profile.
- **Mistral Large 3:** EcoLogits up to 0.11.1 listed `mistral-large-2512` as 123B dense, copied
  from Mistral Large 2. We reported it; 0.11.2 (2026-09-29,
  [PR #262](https://github.com/mlco2/ecologits/pull/262)) takes Mistral's published 675B total /
  41B active mixture-of-experts and a measured 16 tokens/s. `export.py` keeps only our 8–16-bit
  serving range (weights ship in FP8 and BF16; EcoLogits assumes 16-bit and has announced
  changes to how it treats quantization), so 16–32 GPUs: **0.78–1.6 Wh per 400 tokens**.
  Revisit the range when EcoLogits' quantization change lands.
- **Training** (`shared/footprint/training.ts`) is shown whole, never per request: no provider
  publishes a model's lifetime request count. Only Mistral publishes figures — Large 2's life-cycle
  analysis (training + 18 months: 20.4 kt CO₂e, 281,000 m³ water, 660 kg Sb eq), shown as the
  closest figure for Large 3 (trained on 3,000 H200s, 5.5× the parameters). Google, Inworld,
  ElevenLabs and Soniox are named as "not disclosed".
- **Known limitation:** EcoLogits models only output tokens. Reading the input (prefill) is not
  counted, which matters for the realtime agents (~3,000 input tokens per turn).

**Updating** (in `server/`, needs [uv](https://docs.astral.sh/uv/)):
- `npm run footprint:check` — is a newer EcoLogits on PyPI? Exits 1 if so.
- `npm run footprint:update` (or `-- --version X`) — regenerates the table and prints energy per
  400 units before → after. Review the JSON diff and run the tests.
- Adding a model: add it to `MODELS` in `export.py`, then `footprint:update`.

### Room electricity

Shelly plugs (`scripts/shelly/room-power.js`) post `{ plug, deviceId, watts, energyCounterWh }`
every 5 s to `POST /api/installation/room-power` with `X-Installation-Key` (`COUNCIL_INSTALLATION_KEY`,
the one key an installation's devices share; unset → 503). `plug` is
the number marked on the plug, which its Shelly device name ends in (`CouncilPlug-2`); `deviceId` the Shelly's own id.
The plug knows nothing else: each venue in `COUNCIL_VENUES` lists its `plugs` with a label, and
a report is stored under the venue that lists the plug *when it arrives* (unlisted → 404). So
moving an installation is moving its plug numbers to the new venue; nothing is dated, and what a
plug measured stays with the venue it was at. A number belongs to the Shelly that last reported
as it until that one is silent for 20 s: a replacement takes over by itself, starting from its own
counter, and a second Shelly with the same number is refused (409).

`RoomPowerService` keeps the latest reading per venue and plug in `room_power` and accumulates
energy in one atomic update that survives the plug's counter resetting. What each report adds
also goes into `room_power_hours`, one document per venue, plug and UTC hour (`energyWh`,
`maxWatts`, `reports`, latest `label` and `deviceId`): the history for questions the running total
cannot answer, such as energy from a date or per day. About 3 MB for three plugs over six
months, so it is kept forever. Any number of plugs; they join the installation's own router. Hardware: Shelly Plug S Gen3 ×3; the
projector (BenQ TH682ST) draws ≈ 244 W typical, 320 W max.

### Meter screen and methodology page

- **URLs** (same in dev and production): `/meter?venue=<id>` and `/meter/methodology`, served
  from `client/dist/meter.html` by `registerMeterPage` (in dev, a plugin in
  `client/vite.config.mts`). `?demo` fakes a feed (TEMPORARY, marked on screen);
  `?rotate=90|-90` turns the meter for a display the OS cannot rotate.
- **Data:** `GET /api/meter?venue=<id>` returns a `MeterSnapshot` (`shared/MeterTypes.ts`):
  usage totals for all councils, the venue and its latest meeting, plus the room's plugs.
  `useMeterFeed` refetches it on every socket (re)connect and folds pushed events in.
- **Screen**, under the title "AI Energy & Water Use". Sections with estimates are tagged
  *Estimated*; the estimates are floors as well as ranges, so what lies outside them gets as much
  room as what is inside:
  1. **Current meeting**: what the providers bill for (`countedOf`, by each model's
     `role`) — text in tokens, text to speech and speech to text in minutes — then energy, water
     and carbon for the meeting, then the models it has used (`modelsUsed`), one per line with
     role and assumed country, the most recently used first. After three quiet minutes it is
     titled **Last meeting** (`isMeetingActive`, from the meeting's `lastActiveAt`: its latest
     usage, playback progress or setup start).
  2. **Since opening at <venue>**: the same estimates for the whole exhibition, as the room has
     heard it (`heardVenueRows` leaves out the current meeting's unplayed messages, so the two rise
     together); the documented mining places in rotation; and one small line with the room's own
     electricity measured by the plugs, power now and in total.
  3. **Training the models**: Mistral's published figure in tonnes of CO₂e and litres, and an
     empty "not published" slot per maker that publishes nothing (`shared/footprint/training.ts`).
     Never divided per meeting.
  4. **Outside these numbers**: what no figure includes or the companies do not say, in the order
     of the hardware's and models' life, each "not counted" or "not published"
     (`OUTSIDE_THE_NUMBERS` in `shared/footprint/counting.ts`).
  5. **Around the world**: published figures for the build-out, at the end for scale
     (`shared/footprint/world.ts`, sources on the methodology page).
  6. A QR code to the methodology page, which has GPU time, the Sb eq mineral figures, the share
     of the energy resting on guessed models, and how Google and Mistral each count one answer.

  **The current meeting follows playback.** Replies are generated a few messages ahead and played
  gradually, so raw usage runs ahead of what the room has heard. Usage is tagged with the
  `messageIndex` it was for (dialogue, chair lines and summary in `DialogGenerator`, voices and
  Whisper timing in `AudioSystem`, the handoff classifier), the snapshot splits the meeting's rows
  per message, and the server pushes `meeting-progress` whenever the meeting's
  `maximumPlayedIndex` advances. `playedRows` counts messages up to that index; untagged live
  usage (realtime agents, visitor questions) counts at once.

  **The meeting starts with its setup.** The setup agent talks to the visitor before the meeting
  exists, so its bootstrap names a `setupId` (`setupIdFor`), which tags the session's usage. A
  reconnect sends it back and keeps it; creating the meeting sends it too, and the server gives
  the setup's events and live grants the new `meetingId` (`linkSetupUsage`, `linkSetupGrants`).
  A new setup also pushes `setup-started` to the venue's meters, so the current meeting drops to
  zero as soon as the setup agent connects for the next visitor (a reconnect keeps its setup and
  pushes nothing). The meter hands the setup the first newer meeting id it sees; the snapshot
  shows a setup in progress when it is newer than the venue's latest meeting (`latestOpenSetup`,
  in memory, or after a restart the setup's recorded usage). A setup the visitor walks away from
  stays in the venue's totals only.

  Estimates are only ever shown as ranges — both ends, two significant figures, no midpoint:
  EcoLogits' ends are bounds from extreme inputs, not a distribution. Sized in container units
  (`cqw`), so it scales with the display and rotates without a second set of sizes.
- **Methodology page:** generated from the same tables — how each figure is known, why ranges
  and why they are still too narrow, who's counting in full (each source's boundary), minerals
  (why GPU time, Sb eq explained, >99% from making the hardware, the mining places with sources),
  per-model cards (role, basis, location, size, impacts and GPU time per 400 tokens or minute of
  audio, assumptions, sources), training, and all councils.
- **Mining places** (`MINERAL_PLACES`): tantalum at Rubaya (DR Congo), cobalt around Kolwezi
  (DR Congo), gallium in China, copper at Escondida (Chile) — documented places in each
  mineral's supply, never a claim about which mine fed our hardware. Wording to be reviewed
  before the opening.

---

## Reference points (Sept 2026)

Re-check before an opening.

| Source | Scope | Figures |
|---|---|---|
| Mistral AI — Large 2 life-cycle analysis (with Carbone 4 / ADEME, July 2025) | Per 400-token response, incl. hardware manufacturing | 1.14 g CO₂e, 45 mL water, 0.16 mg Sb eq |
| same | Training + 18 months of use | 20.4 kt CO₂e, 281,000 m³ water, 660 kg Sb eq |
| Google — "Measuring the environmental impact of delivering AI at Google scale" (Aug 2025) | Median Gemini Apps text prompt; on-site water only | 0.24 Wh, 0.03 g CO₂e, 0.26 mL |
| Epoch AI / OpenAI statements | Typical GPT-4o query | ~0.3 / 0.34 Wh |
| "How Hungry is AI?" (arXiv 2505.09598) | 30 models benchmarked | Order-of-magnitude spread by size; reasoning models >30 Wh per long prompt |
| G7 French Presidency overview (May 2026) | Catalogue of standards (ISO/IEC TR 20226, ITU-T L.1801, IEEE P7100, AFNOR Spec 2314, AI Energy Score, ML.ENERGY) | Lineage for our method |

Water differs ~170× between Mistral and Google (45 mL vs 0.26 mL) purely from where the boundary
is drawn: Mistral includes electricity generation and manufacturing; Google counts on-site
cooling only. That difference is itself worth showing.

**Places, as far as they are knowable:**

| Provider | What is public |
|---|---|
| Inworld (router, TTS, STT, realtime) | Runs on Google Cloud; the default deployment we call is in the US (EU and India on enterprise contracts), cloud region not published |
| Google AI Studio (Gemini) | Google's global fleet; no per-request region |
| Mistral | Its API runs in Sweden by default, or the US on its US endpoint; which one Inworld calls is not published (Inworld does call Mistral's own API: the router reports the attempt as `mistral/mistral-large-3` on its own credentials). The meter's range spans both electricity mixes (`zones` in `export.py`) |
| ElevenLabs | `x-region` header per response; US by default, EU/India/Singapore on enterprise plans |
| Soniox | US by default; EU and Japan available |

IP geolocation won't find the GPUs: API endpoints sit behind anycast/CDN front-ends. Show
"probable regions" with the reasoning, and ask providers directly — an answer or a refusal is
itself content.

**Minerals, made tangible:** Sb eq means nothing to visitors. Pair it with named materials and
places from the hardware supply chain — tantalum (DRC, Rwanda), cobalt (DRC), gallium and
germanium (China), copper (Chile), water-intensive chip fabs (Taiwan) — using sites with
documented, citable impacts on local communities, and without claiming which mine fed which GPU.

---

## Open items

- Tune layout and copy on the real display; then remove `?demo`.
- Review the mining places' wording (`shared/footprint/counting.ts`) before the opening.
- Comparisons that make numbers tangible (one per metric, true at both small and large scale).
- Minerals and places content, with reviewed wording about affected communities.
- Human input's speech to text is counted by microphone time, since Inworld reports none for
  transcription-only sessions; switch to their figure if they start reporting it.
- Input (prefill) tokens are not modelled (EcoLogits limitation).
- Drop the unused `usage_totals` collection left from the first version.
- Later: a live map of probable data-centre regions; a mining-sites layer; backfilling past
  meetings; asking providers for regions and per-request data.
- Open question: should "All councils" combine Foods and Forest, or stay per deployment?

---

## Sources

Footprint data and methodology
- Mistral AI, "Our contribution to a global environmental standard for AI" (Large 2 LCA, July 2025) —
  https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai
- Mistral AI, "Introducing Mistral 3" — https://mistral.ai/news/mistral-3/ ·
  model card https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512
- Google, "Measuring the environmental impact of delivering AI at Google scale" (Aug 2025) —
  https://arxiv.org/abs/2508.15734
- EcoLogits — https://ecologits.ai/latest/methodology/llm_inference/ ·
  https://github.com/mlco2/ecologits
- "How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference" —
  https://arxiv.org/abs/2505.09598
- G7 French Presidency, overview of initiatives on AI energy and resource requirements (May 2026) —
  https://www.entreprises.gouv.fr/files/files/Actualites/2026/g7/overview-measurement-monitoring-energy-resource-ai-models.pdf
- ML.ENERGY leaderboard — https://ml.energy/ · AI Energy Score — https://huggingface.co/AIEnergyScore

Speech models
- Inworld, "TTS-1 Technical Report" (1.6B / 8.8B params, 50 tokens/s) — https://arxiv.org/abs/2507.21138
- Inworld on Google Cloud — https://cloud.google.com/customers/inworld
- NVIDIA Parakeet TDT 0.6B — https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2 ·
  OpenAI Whisper large-v3 — https://huggingface.co/openai/whisper-large-v3

Places
- Soniox data residency — https://soniox.com/docs/data-residency
- ElevenLabs data residency — https://elevenlabs.io/docs/overview/administration/data-residency

Minerals and supply chain
- FP Analytics, "Artificial Intelligence and the Critical Minerals Crunch" (2025) —
  https://fpanalytics.foreignpolicy.com/2025/07/18/artificial-intelligence-critical-minerals-supply-chains/
- World Economic Forum, "Scaling metals to secure the data centre materials backbone" (Dec 2025) —
  https://www.weforum.org/stories/2025/12/securing-data-centre-materials/
- China, the DRC and artisanal cobalt mining 2000–2020 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10293843/
- USGS Mineral Commodity Summaries — https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries
