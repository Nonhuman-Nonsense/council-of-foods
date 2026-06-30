# Human input STT — debug log & analysis

Living log for Swedish Soniox / Inworld human-input transcription issues (forest-leo, Jun 2026).

**Related:** [human-input-transcription-delta-plan.md](./human-input-transcription-delta-plan.md), [human-participation-prewarm-plan.md](./human-participation-prewarm-plan.md)

---

## Status snapshot

| Area | State |
|------|--------|
| Server baseline (step 0) | Soniox STT emits events again — model + language only |
| Server step 1 | `transcribePrompt.sv` in config only — does **not** wire to Inworld bootstrap yet |
| Server step 2+ | Not started — prompt wiring, `language_hints` still to bisect |
| Client merge | `soniox` → append — wrong when cumulative snapshots arrive |
| Client isolation | Designed to unmount on submit; possible leaks within same WebRTC session |
| Instrumentation | Flat `REALTIME` logs via `log.flat` — prefix `human-input \|` |

---

## Timeline (Jun 30, 2026)

| Commit / step | Change | Effect |
|---------------|--------|--------|
| Pre-day baseline | Inworld bootstrap: `{ model, language }` only | SV Soniox worked; live text had stacking |
| `448f3e17` STT tweaking | `transcription.prompt` + `language_hints` in bootstrap | SV **silent** — zero `dc-in` events |
| `ab428ea6` | `transcribePrompt.sv` in global-options | Config only until step 2 wires it |
| `16add14c` soniox sv fixes | Client: model-based append for Soniox | Did not fix silence (server was broken) |
| Revert to step 0 | Removed prompt + hints from bootstrap | STT works again |
| Step 1 | Re-added `transcribePrompt.sv` in JSON only | STT still works; bootstrap unchanged |

**Conclusion:** Today's server regression was `language_hints` / prompt **on the Inworld session** (step 2 territory), not the JSON config entry alone.

---

## Server bisection plan

Restart server + hard-reload client after each step. Enable dev log → **REALTIME** only.

| Step | Change | Bootstrap session should show | If it breaks |
|------|--------|------------------------------|--------------|
| **0** ✅ | Model + language only | `{ model: "soniox/stt-rt-v4", language: "sv" }` | Soniox/Inworld platform issue |
| **1** ✅ | `transcribePrompt.sv` in global-options only | Same as step 0 (prompt not wired) | Unlikely — config unused by Inworld path |
| **2** | Wire `transcription.prompt` in `realtimeProviders.ts` | Adds `prompt: "Förvänta dig svenskt tal."` | Prompt breaks STT or changes behaviour |
| **3** | Add `providerData.stt.language_hints: ["sv-SE"]` | Adds providerData | **Previously broke STT entirely** |

---

## Diagnostic logging

Flat copy-paste lines: `log.flat("REALTIME", "human-input | …")` in `HumanInput.tsx`.

### Key log steps

| Log step | Meaning |
|----------|---------|
| `mount` / `unmount` | Component lifecycle |
| `connect-start` / `bootstrap-ok` / `connect-ready` | WebRTC session setup |
| `session-update-sent` | Inworld `session.update` on data channel open |
| `record-start` | Mic enabled — check `previousTranscript`, `mergeMode` |
| `record-skip` | PTT before ready (benign if state already `recording`) |
| `dc-in` | **Every** data-channel event (before filtering) |
| `dc-error` | Inworld `error` events (config rejection) |
| `speech-started` / `speech-stopped` | VAD |
| `delta-applied` | Merge result — check `existing`, `delta`, `next`, `mergeMode` |
| `record-finish` | `hadSpeech: false` → no STT events during hold |
| `finish-no-speech-immediate-ready` | Released with no speech_started/delta/completed |

### English vs Swedish (confirmed)

- **EN (AssemblyAI):** `dc-in` → delta → completed — works
- **SV broken (step 2 config):** `record-start` OK, **zero** `dc-in` during hold
- **SV baseline (step 0/1):** events return; merge issues visible again

---

## Issue 1 — Delta merge (Soniox via Inworld)

### Evidence from logs

**Short utterance — suffix deltas (append correct):**

```
existing: "Hej, kan"   delta: " du"   next: "Hej, kan du"
existing: "Hej, kan du"   delta: " hö"   next: "Hej, kan du hö"
existing: "Hej, kan du hö"   delta: "ra"   next: "Hej, kan du höra"
```

**Longer utterance — cumulative snapshot (append wrong):**

```
existing: "…vi…jag…vi pratar…" (garbled)
delta:    "Det här är tredje gången som vi pratar. Kan du höra"
next:     existing + delta  → worse garbage
```

### Root cause

Client uses `soniox` → **append** (`transcriptionDeltaMergeModeForModel`). Soniox through Inworld sends **mixed** delta shapes on the same event type:

- Suffix chunks → append is correct
- Full interim snapshots → replace is correct

Blind append or blind replace cannot handle both.

### Reference implementation — what to follow

Stack:

```
Browser WebRTC → Inworld realtime API → Soniox (internal)
```

| Layer | Follow for merge? |
|-------|-------------------|
| **Inworld WebRTC** | **Yes** — [conversation.item.input_audio_transcription.delta](https://docs.inworld.ai/api-reference/realtimeAPI/realtime/realtime-webrtc) |
| **OpenAI transcription path** | Append per [OpenAI realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription) |
| **Soniox native WebSocket** | **No** — different wire format; not what the client receives |

Inworld defines `delta` as **"Partial transcription text"** — does not specify suffix vs full snapshot for third-party STT. No doc says Soniox deltas are incremental.

| Model (via Inworld) | Typical delta shape | Strategy |
|---------------------|---------------------|----------|
| AssemblyAI `u3-rt-pro` | Cumulative snapshot | **Replace** |
| OpenAI transcription | Incremental suffix | **Append** |
| Soniox `stt-rt-v4` | **Mixed** (observed) | **Per-delta heuristic** |

PR1 prefix heuristic was on the right track. PR3 (all Inworld → replace) matches Inworld wording for cumulative partials but breaks suffix deltas. Soniox append fix (16add14c) fixes suffixs but breaks cumulative snapshots.

### Recommended fix (not yet implemented)

Per-delta merge in `mergeTranscriptionDelta` for Soniox / Inworld STT:

1. If `!delta` → keep `existing`
2. If `delta.startsWith(existing)` → cumulative → `next = delta`
3. If `existing.endsWith(delta)` → duplicate suffix → `next = existing`
4. Else → incremental → `next = existing + delta`

AssemblyAI stays **replace**. OpenAI path stays **append** (optionally same guards).

### Open question for Inworld support

> For `soniox/stt-rt-v4` over WebRTC, is `conversation.item.input_audio_transcription.delta` an incremental suffix or the full interim transcript?

---

## Issue 2 — Session isolation

### Desired behaviour

Every human-input round is fully isolated. On submit, component unmounts, WebRTC closes, no transcript or STT context carries over.

### Actual lifecycle

```
participationPhase !== "off"  →  HumanInput mounted
  warm   → connect(), UI hidden
  active → same instance, same WebRTC connection
  off    → unmount → cleanup closes connection
```

On submit (`handleOnSubmitHumanMessage` → `councilState: 'loading'`):

- `participationPhase` → `off`
- Component unmounts
- Unmount cleanup: abort, `connectionRef.close()`, mic stopped

**Across council rounds:** design is correct — remount → fresh `connect()`.

See [human-participation-prewarm-plan.md](./human-participation-prewarm-plan.md).

### Where isolation can break

#### A. Multiple PTT presses, same human turn (most likely)

`finishRealtimeSession` **keeps WebRTC open** for re-record. Second PTT on same visit:

- `setTranscriptSegments([])` — segments cleared
- `setPreviousTranscript(inputValue)` — **prior textarea carried into next take**
- Same Inworld/Soniox session — server may retain STT context

Can look like "round 2 leak" without a second council visit.

#### B. Warm + active share one connection

Pre-warm mounts during invitation audio (`warm`), not at floor open (`active`). Session spans entire warm + active phase by design.

#### C. Late data-channel events

Events may arrive during `finishing` or after release. Possible interaction with `completedTranscriptKeysRef` if a new `record-start` overlaps.

#### D. No remount `key`

Remount depends on `participationPhase === "off"`. Normal submit path should hit `off`. Edge cases (index/message slice bugs) could skip unmount.

#### E. Server-side STT context

Client unmount closes peer connection; does not guarantee Inworld instantly drops STT state if close is async or events were in flight.

### Isolation test protocol — result (3 rounds, 2026-06-30)

**Verdict: client isolation across rounds is OK.** Stacking is within-session merge, not cross-round leak.

| Round | `item_id` | `record-start` `previousTranscript` | `bootstrap-ok` / new connect | Merge behaviour |
|-------|-----------|--------------------------------------|------------------------------|-----------------|
| 1 | `7d1bd73f-…` | `""` | (not in paste; deltas clean) | Incremental suffixes only — append correct |
| 2 | `84297609-…` | `""` | Yes — `bootstrap-ok` → `connect-ready` before `record-start` | Incremental throughout — append correct |
| 3 | `62d2de07-…` then `46b3ef7a-…` | `""` | Yes — but `record-start` while `dcState: "connecting"` | Incremental then **cumulative snapshot** mid-utterance → stack |

**Round 1–2:** Suffix deltas only (`"ej"`, `" nu"`, `" test"`, `"ar"`, …). `next` always correct.

**Round 3 — stacking trigger (same `item_id`, same PTT hold):**

```
existing: "Och nu ska vi se en tredje gång."
delta:    "Och nu ska vi se en tredje gång, ska"   ← full cumulative snapshot
next:     "Och nu ska vi se en tredje gång.Och nu ska vi se en tredje gång, ska"
```

Later on segment `46b3ef7a-…` (new `item_id` within same recording — VAD re-segmented):

```
existing: "Eller? Nej, nu bruk"
delta:    " Eller? Nej, nu dök den"   ← cumulative again
next:     "Eller? Nej, nu bruk Eller? Nej, nu dök den"
```

**Why it “self-corrected” visually:** Subsequent suffix deltas kept appending on the garbled base, refining the tail; `completed` may also replace with the final string; new `item_id` segments start with empty `existing`.

**Round 3 timing note:** `record-start` fired with `dcState: "connecting"` (before `session.updated`). Worth avoiding — mic open before DC ready — but STT still emitted events.

**Duplicate log lines:** Each `delta-applied` appears twice — React StrictMode double-invoking the `setTranscriptSegments` updater in dev.

### Isolation hardening options (lower priority after 3-round test)

1. **Prefix-aware merge** — fixes display; not isolation
2. **Reset on `phase → active`** — clear all transcript state entering floor
3. **`key` on HumanInput** — e.g. awaiting message id — force remount per visit
4. **Close + reconnect per visit or per PTT take** — strict isolation vs pre-warm latency trade-off
5. **Close connection on submit** before unmount — belt-and-suspenders

---

## Work order (one issue at a time)

1. ~~**Session isolation**~~ — **cleared** (3-round log: new `item_id`, empty `previousTranscript`, fresh connect per round)
2. ~~**Delta merge**~~ — **stopgap `adaptive` merge** in `mergeTranscriptionDelta`; proper fix → [human-input-transcription-segment-plan.md](./human-input-transcription-segment-plan.md)
3. ~~**Phase 0 wire audit**~~ — **complete** (see results below); no hidden tags on wire → **Phase 2b**
4. **Phase 1/2b** — committed/provisional segment store (replace stopgap `adaptive`)
5. **Server bisection** — step 2 (wire prompt), then step 3 (`language_hints`)

### Phase 0 results (2026-06-30 — SV PTT, long utterance)

**Verdict:** Inworld WebRTC exposes **only** documented fields. No `providerData`, `tokens`, `is_final`, or `extraKeys` on delta or completed.

**Delta pattern this session:** 100% suffix chunks (`deltaLen` 2–7). Adaptive append was correct for every event — transcript built cleanly to completion.

**Sample delta wire shape:**
```json
{"keys":["content_index","delta","event_id","item_id","type"],"extraKeys":[],"deltaLen":4,"delta":"atar"}
```

**Completed wire shape:**
```json
{"keys":["content_index","event_id","item_id","transcript","type"],"extraKeys":[],"transcriptLen":132}
```

**Implication:** Soniox `is_final` / token stream is **not** passed through Inworld on this path. Client must use Phase 2b (committed + provisional + inference). Optional Phase 3: ask Inworld for token passthrough.

**Caveat:** Suffix-only runs work with append; **mixed suffix + snapshot** runs fail when early-token revision drops below the old 60% prefix ratio (e.g. `ånden` → `hunden`). Fixed 2026-06-30: snapshot detect via `deltaLen ≥ 12` + shared prefix ≥ 5 chars or matching first token.

**Failure case (2026-06-30):** After suffixes built `Den här ånden`, snapshot `Den här hunden, ni kan` (deltaLen 22) stacked because prefix `Den här ` was only 8/14 = 57%. Later snapshots at deltaLen 58/63/96 same pattern.

**Full utterance (completed):** "Nu pratar jag att testet pratar lite längre och se om det funkar, och så ska jag testa vad som ser om kommer på tråden. Vad tror du?"

---

## Session notes

### 2026-06-30 — SV silent with full server PR2 config

- Bootstrap 200 with correct Soniox session; zero `REALTIME` during hold
- `record-start` OK; `hadSpeech: false` on release
- Reverting bootstrap to step 0 restored events

### 2026-06-30 — Step 0/1 working; stacking returns

- Suffix deltas on short speech; cumulative snapshots on longer speech
- Step 1 (`transcribePrompt.sv` in JSON only) does not change bootstrap — stacking not caused by step 1

### 2026-06-30 — Three-round isolation test

- Rounds 1–2: clean incremental append throughout
- Round 3: stacking when cumulative `delta` mid-utterance; two `item_id`s in one hold
- Isolation across council rounds: **not the problem**

### _Pending — further logs_

_(none)_
