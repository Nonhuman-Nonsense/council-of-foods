# Human input — live transcription delta fix

Fix stacked / duplicated partial transcript text in the HumanInput textarea during voice capture (e.g. `I am sayI am saying something…`).

**Status:** Plan only.

**PR1 status:** Done.

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

Gaps vs Inworld recommendations are **optional follow-ups** (transcription prompt, Soniox `language_hints`, `eagerness` tuning) — not required to fix the display bug.

---

## Fix strategy (client only)

Replace naive append with a few lines of merge logic **inline in `handleRealtimeEvent`** inside `client/src/council/humanInput/HumanInput.tsx`:

1. Read `existing` for `event.item_id` from the functional `setTranscriptSegments` updater (unchanged).
2. Compute `next`:
   - If `delta` extends `existing` as a prefix (`delta.startsWith(existing)`) → **replace** with `delta` (cumulative / revision).
   - Else if `existing` already contains `delta` as a prefix (`existing.startsWith(delta)`) → **keep** `existing` (stale partial).
   - Else → **append** `existing + delta` (incremental, OpenAI-style).
3. `upsertTranscriptSegment(prev, event.item_id, next)` as today.

No new files. No shared utility module. If we need a testable pure function later, follow the existing pattern in the same file (`upsertTranscriptSegment`, `formatTranscriptInputValue` are already exported from `HumanInput.tsx` for unit tests) — but **PR1 should prefer inline logic** unless tests force a one-line extract in that file.

`conversation.item.input_audio_transcription.completed` already replaces the segment with `event.transcript` — leave as-is.

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

### PR3 — Hardening (optional, later)

**File:** `client/src/council/humanInput/HumanInput.tsx` only.

- Track completed `item_id`s in a ref; ignore late deltas after `completed`.
- Key segments by `item_id` + `content_index` if we observe multi-part items in logs.
- Strip `"..."` from `previousTranscript` when hitting max length mid-recording.

---

## PR1 summary (what to implement first)

One focused change in the delta handler:

```ts
// Inside handleRealtimeEvent, delta branch — pseudocode
const existing = prev.find(s => s.itemId === event.item_id)?.text ?? "";
const { delta } = event;
let next: string;
if (!delta) {
  next = existing;
} else if (!existing) {
  next = delta;
} else if (delta.startsWith(existing)) {
  next = delta;
} else if (existing.startsWith(delta)) {
  next = existing;
} else {
  next = existing + delta;
}
setTranscriptSegments(prev => upsertTranscriptSegment(prev, event.item_id, next));
```

Plus one integration test with cumulative deltas in `HumanInput.test.jsx`.

That is the full PR1 scope: fix the bug, keep the diff small, stay inside existing files.
