# Human input — transcription segment state plan

Replace heuristic `adaptive` merge with an explicit per-segment state model aligned to how Soniox actually works — **if** the wire gives us enough information. If not, document the gap and fall back in a principled way.

**Related:** [human-input-stt-debug-log.md](./human-input-stt-debug-log.md), [human-input-transcription-delta-plan.md](./human-input-transcription-delta-plan.md)

**Status:** Phase 0 complete — proceed to Phase 1/2b.

---

## Phase 0 conclusion (2026-06-30)

| Check | Result |
|-------|--------|
| `extraKeys` on delta/completed | **Empty** — only documented schema |
| `providerData` | **Absent** on transcription events |
| `tokens` / `is_final` / `hints` | **None** |
| Delta shape in test | All suffix chunks (`deltaLen` 2–7) — append merge correct |
| Cumulative snapshot in test | **Not observed** — prior stacking case still needs inference rules |

**Next:** Phase 1 — refactor to `committed` + `provisional` per segment; keep inference for snapshot/revision deltas. Phase 3 (ask Inworld) optional in parallel.


## The question

> Are we just guessing in `adaptive` mode? Can we store data in a structure and append/replace based on tags from Soniox?

**Short answer:**

| Layer | Has explicit append vs replace tags? |
|-------|--------------------------------------|
| **Soniox native WebSocket** | **Yes** — per-token `is_final`; provisional tokens are **replaced** each event, final tokens are **appended** once |
| **Inworld WebRTC** (`conversation.item.input_audio_transcription.delta`) | **No** in public API — only `item_id`, `content_index`, `delta` (string) |
| **Our client today** | Collapses everything into one string per segment + heuristic merge |

So: Soniox **does** tag updates — but Inworld’s realtime envelope **collapses** them into a single `delta` string before we see it. We are not missing an obvious field in our TypeScript types; we need to verify the raw wire and then either use hidden metadata or implement Soniox’s **semantic** model with inference.

---

## How Soniox intends clients to work (reference)

From [Soniox real-time transcription](https://soniox.com/docs/stt/rt/real-time-transcription):

```
final_tokens: Token[]      // append-only — each token sent once, is_final: true
non_final_tokens: Token[]  // replace entirely on every event — is_final: false
display = render(final_tokens) + render(non_final_tokens)
```

On each WebSocket message:

1. Append any new `is_final: true` tokens to `final_tokens`
2. **Replace** `non_final_tokens` with the current event’s non-final set (do not accumulate)
3. Render both lists

This is **not guessing** — it is a tagged, documented protocol.

**Inworld’s `delta` field is a lossy projection of that stream.** Our logs prove the projection mixes:

- Suffix chunks (`" nu"`, `"ar"`) — behaves like new non-final token text
- Full interim strings (`"Och nu ska vi se…, ska"`) — behaves like replaced non-final snapshot
- Revised hypotheses (`" Eller? Nej, nu dök den"`) — non-final replacement with edited prefix

---

## What Inworld documents today

[WebRTC `input_audio_transcription.delta`](https://docs.inworld.ai/api-reference/realtimeAPI/realtime/realtime-webrtc):

| Field | Purpose |
|-------|---------|
| `item_id` | Conversation item (VAD segment) |
| `content_index` | Content part within item |
| `delta` | “Partial transcription text” (undefined incremental vs snapshot) |
| `transcript` on `.completed` | Final text for that item/part |

Optional on transcription events when `providerData.stt.voice_profile: true`:

- `providerData.voiceProfile` — age/gender/emotion etc., **not** token flags

No documented `is_final`, `delta_kind`, or `tokens[]` on WebRTC transcription deltas.

---

## Target architecture (client)

### Per-segment state (Soniox-aligned)

One entry per `transcriptSegmentKey(item_id, content_index)`:

```ts
type SegmentTranscriptState = {
  /** Text confirmed by completed or equivalent final signal */
  committed: string;
  /** Live hypothesis — replaced or extended per rules below */
  provisional: string;
};

function segmentDisplayText(state: SegmentTranscriptState): string {
  return (state.committed + state.provisional).trim(); // + spacing rules
}
```

Map: `Map<string, SegmentTranscriptState>` (or array keyed by segment key).

Multi-segment display: join non-empty `segmentDisplayText` values in first-seen order (same as today’s `transcriptSegments`).

### Event handling (ideal — if tags exist)

| Event | Action |
|-------|--------|
| Delta with `tokens[]` + `is_final` | Soniox-native: append finals to `committed`, replace `provisional` from non-finals |
| Delta with `delta_kind: "append"` | `provisional += delta` |
| Delta with `delta_kind: "replace"` | `provisional = delta` |
| `.completed` with non-empty `transcript` | `committed = transcript`, `provisional = ""`, lock segment |

### Event handling (realistic — Inworld string `delta` only)

Until tags are confirmed on the wire, apply **Soniox semantics with inference**:

| Condition on `delta` vs `committed + provisional` | Treat as | Update |
|---------------------------------------------------|----------|--------|
| `delta.startsWith(committed + provisional)` or strong prefix overlap with full display | Non-final **replacement** (snapshot) | `provisional = delta.slice(committed.length)` or `provisional = inferred suffix` |
| Short suffix, does not start with display | Non-final **extension** (token stream) | `provisional += delta` |
| `existing.endsWith(delta)` | Duplicate | no-op |
| `.completed` | Finalize | `committed = transcript`, `provisional = ""` |

This is the same logic as current `adaptive` merge, but stored explicitly as `committed` / `provisional` instead of one opaque `segment.text` string — easier to reason about, test, and log.

**AssemblyAI:** single `provisional = delta` each time (cumulative snapshot); `committed` empty until completed.

**OpenAI transcription session:** `provisional += delta` only.

---

## Implementation phases

### Phase 0 — Wire audit (1 short test, no behaviour change)

**Goal:** Confirm whether Inworld already sends hidden metadata.

**Instrumentation (done):** `auditTranscriptionWireEvent` + flat `human-input | dc-in-wire` lines on every transcription delta/completed. Each line includes:

- `keys` / `extraKeys` — all top-level fields vs documented schema
- `providerData` + `providerDataKeys`
- `hints` — nested `tokens`, `is_final`, `word_timestamps`, `delta_kind`, etc.
- `deltaLen` / `transcriptLen`

**How to run the audit:**

1. Enable REALTIME dev logging in setup.
2. Swedish PTT — hold button, speak a multi-word phrase (trigger suffix deltas then a longer snapshot).
3. Filter console for `dc-in-wire` (or copy all `human-input |` lines).
4. Paste into this doc under **Phase 0 results** below.
5. Note the first `dc-in-wire` where `deltaLen` jumps from small suffix to full phrase length.

**Optional follow-up:** enable `providerData.stt.voice_profile: true` in bootstrap for one test — check if extra fields appear on transcription events.

**Outcomes:**

| Finding | Next step |
|---------|-----------|
| `tokens[]` or `is_final` present | Phase 2a — tagged path, drop heuristics |
| `providerData.stt` only | Phase 2b — structural store + inference |
| Nothing extra | Phase 2b + Phase 3 (ask Inworld) |

### Phase 1 — Segment state store (client, `HumanInput.tsx`)

**Goal:** Replace `TranscriptSegment { itemId, text }` + `mergeTranscriptionDelta` with explicit state.

1. Introduce `SegmentTranscriptState` + `applyTranscriptionDelta(state, delta, mode)` / `finalizeSegment(state, transcript)`
2. `transcriptSegments` becomes `segmentStates: SegmentTranscriptState[]` keyed by `itemId` (= segment key)
3. `formatTranscriptInputValue` reads `segmentDisplayText` per segment
4. Logging: `segment-update` with `{ committed, provisional, delta, rule: "replace-provisional" | "append-provisional" }`
5. Keep model-based mode: `soniox → inferred`, `assemblyai → replace`, `openai → append`

**Tests:**

- Unit: Soniox suffix chain, cumulative snapshot, revised hypothesis (from production logs)
- Unit: AssemblyAI cumulative, OpenAI append
- Integration: existing `HumanInput.test.jsx` cases

**Remove:** `TranscriptionDeltaMergeMode = "adaptive"` as public concept — fold into segment applier.

### Phase 2a — Tagged path (only if Phase 0 finds metadata)

Parse tokens or `delta_kind`; map directly to committed/provisional updates. No prefix heuristics on Soniox.

### Phase 2b — Inferred path (default if no tags)

Implement inference rules in `applyTranscriptionDelta` with named rules (not opaque 60% threshold without comments). Document each rule with a log line citing which rule fired.

Consider tightening rules using **delta length vs display length** (snapshot deltas are usually longer than 1–3 char suffixes).

### Phase 3 — Upstream (optional, parallel)

1. **Ask Inworld support:** Does `soniox/stt-rt-v4` over WebRTC expose token-level `is_final` or a delta kind? Can `providerData.stt` request passthrough?
2. **If blocked:** Evaluate Soniox WebSocket only for SV human-input (high cost — separate audio path, loses WebRTC simplicity). **Not recommended** unless Inworld confirms they will not expose token metadata.

### Phase 4 — Server bisection (unchanged)

Continue prompt / `language_hints` steps separately from segment state work.

---

## What we are NOT doing

| Approach | Why not |
|----------|---------|
| Guess without structure | Hard to debug; adaptive merge hides committed vs live |
| Assume `delta` is always incremental or always cumulative | Proven false for Soniox via Inworld |
| Rely on Soniox WebSocket docs for merge directly | Wrong transport — we receive Inworld events |
| New modules / context layer | Stay in `HumanInput.tsx` per project convention |
| Display only on `.completed` | Bad live UX; deltas matter for PTT |

---

## Decision matrix

```
Phase 0 wire audit
        │
        ├─ tokens / is_final found ──► Phase 2a (tagged, exact Soniox model)
        │
        └─ string delta only ────────► Phase 1 + 2b (committed/provisional + inference)
                                              │
                                              └─► Phase 3 ask Inworld
```

---

## Success criteria

1. Round-3 utterance (long Swedish) shows clean live text — no `gång.Och nu ska…` doubling
2. Short suffix streams still grow smoothly (`Hej, nu testar…`)
3. Logs show `committed` / `provisional` and which rule fired — not opaque `next` string
4. If Phase 0 finds tags, inference rules are bypassed for Soniox
5. AssemblyAI / OpenAI paths unchanged in behaviour

---

## Open questions for Inworld

1. For third-party STT on WebRTC, is `delta` incremental suffix, full interim snapshot, or model-dependent?
2. Can Soniox `tokens[]` / `is_final` be exposed on transcription events or via `providerData`?
3. Does `conversation.item.input_audio_transcription.completed` always fire with the same text as the last delta snapshot for that item?

---

## Current interim state

`adaptive` merge in `mergeTranscriptionDelta` is a **stopgap** implementing Phase 2b inference in one function. Phase 1 refactors that into an explicit segment store so we are not “just guessing” without structure — we are **applying Soniox’s committed/provisional model with inferred event types** until the wire gives us tags.
