# Human input — live transcription delta fix

Fix stacked / duplicated partial transcript text in the HumanInput textarea during voice capture (e.g. `I am sayI am saying something…`).

**Status:** PR1–PR3 done.

**PR1 status:** Done.

**PR2 status:** Done.

**PR3 status:** Done.

**Scope principle:** Small, local changes. No new modules. Logic stays in files that already own human input (`HumanInput.tsx` for the client fix; `realtimeProviders.ts` only if we later tune the Inworld session).

---

## Problem

While recording, the textarea should grow gradually as STT partials arrive. Instead, text sometimes stacks without spaces:

```
I am sayI am saying somethingI am saying something longer
```

The final `conversation.item.input_audio_transcription.completed` event usually produces a correct full string; the bug is visible only during live partial display.

---

## Root cause

`handleRealtimeEvent` always **appends** each `delta` onto the stored segment text:

```ts
`${existing}${event.delta}`
```

That is correct only when every `delta` contains **new text since the last event** (OpenAI incremental style).

Production uses **Inworld WebRTC** with third-party STT models (`assemblyai/u3-rt-pro` for EN, `soniox/stt-rt-v4` for SV). Those backends typically emit **cumulative partial transcripts** — each `delta` is the full interim text so far, not just the suffix. Appending cumulative partials produces exactly the reported stacking pattern.

Existing unit/integration tests assume incremental deltas (`"Hello"` + `" dear"` + `" council"`), so they pass while production fails.

---

## Provider setup (no switch needed)

Both languages are already Inworld in `server/global-options.json`:

| Language | Provider | STT model |
|----------|----------|-----------|
| `en` | `inworld` | `assemblyai/u3-rt-pro` |
| `sv` | `inworld` | `soniox/stt-rt-v4` |

The OpenAI path (`type: "transcription"`, `server_vad`, `gpt-4o-transcribe`) remains in `server/src/api/realtimeProviders.ts` for optional future use. **Do not remove it.**

Inworld session shape for human input is otherwise aligned with their WebRTC guidance:

- `oai-events` data channel, ICE servers, `session.update` on channel open
- `semantic_vad` with `create_response: false` (STT-only, no agent reply)
- `output_modalities: ["text"]` (no TTS output)

Gaps vs Inworld recommendations are **optional follow-ups** (transcription prompt, Soniox `language_hints`, `eagerness` tuning) — not required to fix the display bug. After PR2, prompt and Soniox hints are wired; see **Remaining alignment** below.

---

## Fix strategy (client)

**PR1 (shipped):** Prefix-heuristic merge (cumulative + incremental in one code path).

**PR3 (revised):** Replace heuristic with **provider-specific** merge — no guessing. Store `bootstrap.provider` in a ref at connect time.

| Provider | Doc semantics | Delta handling |
|----------|---------------|----------------|
| **`inworld`** | `delta` = *"Partial transcription text"* ([Inworld WebRTC API](https://docs.inworld.ai/api-reference/realtimeAPI/realtime/realtime-webrtc)) — the current interim transcript for that item/part | **Replace:** `next = delta` |
| **`openai`** | `delta` = *"newly available transcript text"* ([OpenAI realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)) | **Append:** `next = existing + delta` |

`completed` still **replaces** with full `transcript` for both providers.

Production is Inworld-only today; OpenAI path stays correct for future `provider: "openai"` config.

---

## Pull requests

### PR1 — Fix live transcript display (required)

**Goal:** Correct gradual build-up for cumulative and incremental deltas.

**Files touched:**

| File | Change |
|------|--------|
| `client/src/council/humanInput/HumanInput.tsx` | Inline merge logic in the delta branch of `handleRealtimeEvent` |
| `client/tests/unit/components/HumanInput.test.jsx` | Integration test: cumulative deltas via mocked `onEvent` assert clean textarea value |
| `client/tests/unit/components/HumanInput.test.tsx` | Optional: only if we export a small merge helper from `HumanInput.tsx` for direct unit tests |

**Not in PR1:** `realtimeProviders.ts`, `global-options.json`, new docs beyond this plan, `content_index` keying, post-`completed` delta guard, transcription prompt wiring.

**Test plan (manual):**

1. Museum or mic mode: record a multi-word utterance; textarea grows word-by-word without duplicated prefixes.
2. PTT release: auto-submit text matches what was shown (minus `...` suffix).
3. Second recording after editing text: new speech appends after existing typed content as before.

**Test plan (automated):**

- New jsx test fires cumulative deltas (`"I am say"` → `"I am saying something"` → `"I am saying something longer"`) and expects `"I am saying something longer"` in the textarea (and/or on submit).
- Existing incremental delta test (`"Hello"` / `" dear"` / `" council"`) still passes.

---

### PR2 — Session tuning (optional, later)

**Goal:** Align Inworld bootstrap with doc recommendations; no provider change.

**File:** `server/src/api/realtimeProviders.ts` only.

- Pass `transcription.prompt` from existing `transcribePrompt` config on the Inworld branch (today only wired for OpenAI).
- Optionally add `providerData.stt.language_hints` for Swedish Soniox.

**Status:** Done.

---

### PR3 — Hardening + Swedish prompt (final)

**Goal:** Close remaining practical gaps. Still small diffs, same files as before — no new modules.

**Status:** Done.

---

## Final plan (PR3) — implemented

### In scope

| # | Change | File | Notes |
|---|--------|------|-------|
| 1 | **Provider-specific delta merge** | `HumanInput.tsx` | `realtimeProviderRef` from `bootstrap.provider`. Inworld → replace with `delta`; OpenAI → append. Removes PR1 `startsWith` heuristic. |
| 2 | **Ignore late deltas after `completed`** | `HumanInput.tsx` | `useRef<Set<string>>` of completed segment keys. |
| 3 | **Key segments by `item_id` + `content_index`** | `HumanInput.tsx` | Use `transcriptSegmentKey(item_id, content_index ?? 0)` — small helper, ~3 lines. Inworld sends the field; cheap to honour. |
| 4 | **Strip `"..."` on max-length rollover** | `HumanInput.tsx` | + unit test |
| 5 | **Swedish `transcribePrompt`** | `global-options.json` | `"sv": "Förvänta dig svenskt tal."` — sent as `audio.input.transcription.prompt` on Inworld bootstrap (already wired PR2); Soniox receives it via Inworld session, not a separate API. |
| 6 | **Tests** | `HumanInput.test.tsx`, `HumanInput.test.jsx`, `realtimeProviders.test.ts` | Inworld cumulative test + OpenAI incremental test (mock `provider: 'openai'` on incremental test). |

### Out of scope (defer unless product asks)

| Item | Why defer |
|------|-----------|
| `eagerness: "high"` for museum PTT | Needs manual latency testing; changes turn-commit timing |
| `turn_suggestion` events | New UI/timer behaviour; not required by Inworld |
| `providerData.stt` threshold overrides | `eagerness: "medium"` defaults are fine for now |
| Non-prefix STT corrections (`"colour"` → `"color"`) | Rare; `completed` fixes final text; overlap merge adds complexity |
| `voice_profile` on transcription events | Not used for textarea display |

---

### Implementation detail (`HumanInput.tsx`)

**Provider ref** — set in `connect()` from `bootstrap.provider`:

```ts
const realtimeProviderRef = useRef<RealtimeProvider>("inworld");
// connect(): realtimeProviderRef.current = bootstrap.provider;
```

**Delta merge** (replaces PR1 heuristic):

```ts
const key = transcriptSegmentKey(event.item_id, event.content_index ?? 0);
const existing = prev.find(s => s.itemId === key)?.text ?? "";
const next =
  realtimeProviderRef.current === "openai"
    ? existing + (event.delta ?? "")
    : (event.delta ?? existing);
```

**Segment key helper:**

```ts
function transcriptSegmentKey(itemId: string, contentIndex = 0): string {
  return contentIndex === 0 ? itemId : `${itemId}:${contentIndex}`;
}
```

**Completed-item guard**, **max-length ellipsis**, **`content_index` on event types** — unchanged from prior plan.

---

### Config change

`server/global-options.json`:

```json
"transcribePrompt": {
  "en": "Expect english input.",
  "sv": "Förvänta dig svenskt tal."
}
```

Copy is intentionally parallel to English. Adjust wording if product prefers domain vocabulary (council, forest, etc.).

`realtimeProviders.ts` already resolves `transcribePrompt[language] ?? transcribePrompt.en` — no server code change needed beyond config.

---

### Test plan

**Unit (`HumanInput.test.tsx`)**

- `upsertTranscriptSegment` with composite keys (`item_a:1` vs `item_a:0`) keeps separate segments
- Optional: `formatTranscriptInputValue` unchanged behaviour when one segment per item

**Integration (`HumanInput.test.jsx`)**

- **Inworld:** cumulative deltas (existing test) — `provider: 'inworld'`
- **OpenAI:** incremental deltas (`"Hello"` + `" dear"` + `" council"`) — mock `provider: 'openai'` on that test only
- Late `delta` after `completed` ignored
- Max-length ellipsis (unit or integration)

**Server (`realtimeProviders.test.ts`)**

- Swedish bootstrap includes `transcription.prompt: "Förvänta dig svenskt tal."` once config is added
- English bootstrap unchanged

**Manual**

1. SV meeting: confirm prompt doesn't say "english" in session (optional: log bootstrap session)
2. Long utterance near 10k chars: no `"..."` baked into editable text after auto-stop
3. Rapid release after speech: `completed` then stray delta doesn't corrupt textarea

---

### Open questions

| Question | Status |
|----------|--------|
| Swedish prompt wording | `"Förvänta dig svenskt tal."` — confirmed |
| Provider-specific vs heuristic | **Provider-specific** — PR3 replaces PR1 heuristic |
| `content_index` | **Include** — low effort, schema-complete |
| Max-length test | **Include** |

**Verdict:** Ready to implement PR3.

---

### Deferred: non-prefix STT revisions

OpenAI docs mention partials that **revise** earlier text (e.g. `"colour is nice"` → `"color is nice"` without a shared append prefix). Neither provider-specific replace nor append handles that cleanly; `completed` still fixes the submitted text. Not worth extra merge logic unless we see it in production.

---

### PR checklist (definition of done)

- [x] Provider-specific delta merge (replaces PR1 heuristic)
- [x] Late deltas after `completed` ignored
- [x] Segments keyed by `item_id` + `content_index`
- [x] Max-length rollover strips `"..."`
- [x] `transcribePrompt.sv` in `global-options.json`
- [x] Tests green (client HumanInput + server realtimeProviders)
- [x] Plan doc PR3 marked Done

---

### PR3 — Hardening (optional, later) — superseded by **Final plan (PR3)** above

**File:** `client/src/council/humanInput/HumanInput.tsx` only.

- Track completed `item_id`s in a ref; ignore late deltas after `completed`.
- Key segments by `item_id` + `content_index` if we observe multi-part items in logs.
- Strip `"..."` from `previousTranscript` when hitting max length mid-recording.

---

## PR1 summary (shipped)

Prefix-heuristic merge — superseded in PR3 by provider-specific replace/append.

---

## Remaining alignment (after PR1–PR2)

| Area | Status |
|------|--------|
| WebRTC / session / STT-only Inworld setup | Done |
| Cumulative delta display | Done — provider-specific replace (Inworld) / append (OpenAI) |
| `transcription.prompt` + Soniox `language_hints` | Done (PR2) |
| PR3 hardening + `transcribePrompt.sv` | Done |
| `eagerness` / `turn_suggestion` / STT threshold tuning | Deferred |
| Non-prefix transcript revisions | Deferred — see below |
