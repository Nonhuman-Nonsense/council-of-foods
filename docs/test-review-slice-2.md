# Test review — slice 2: audio pipeline (server)

> **Status: applied.** Full server suite: 442 tests unchanged (this slice's changes were all
> cleanup, not test count), all green; type-check and lint clean.

Verdicts against [TESTING.md](../TESTING.md). Files reviewed: `AudioSystem.test.js`,
`AudioSystemElevenLabs.test.js`, `AudioSystemInworld.test.js`, `AudioDrain.test.js`,
`AudioUtils.test.ts`, `PronunciationUtils.test.ts`, `SubtitleTimingValidation.test.ts`,
`EstimatedSubtitles.test.ts`, `ElevenLabsAlignmentUtils.test.ts`,
`audioHttp.integration.test.js` — 10 files, ~1776 lines.

**Overall:** strong coverage, no missing or duplicate behaviors found. The three
provider-specific `AudioSystem*` files (OpenAI, ElevenLabs, Inworld) are a legitimate split —
each provider has its own request shape, alignment format, and locale/model quirks (e.g.
ElevenLabs' `voice_settings`/language_code, Inworld's TTS-1 vs TTS-2 model selection by
locale) — not duplication of the same behavior. The findings here are all pre-existing
comment/code cruft that had accumulated in a few files, not missing coverage: two files had
tests written with visible "thinking out loud" left in — duplicated mock setup the author
wasn't sure had worked, and a narrated admission of settling for a weaker assertion than
intended. Cleaned without changing what's actually verified.

## Findings

| verdict | file | reason |
|---|---|---|
| **FIX (dead code)** | `AudioSystemInworld.test.js` — "should use native timings if provided (Phase 2)" | The test called `mockFetch.mockResolvedValue(...)` with an identical payload twice in a row, sandwiched between `vi.clearAllMocks()` and five lines of comments debating whether the mock still worked after clearing ("But vi.clearAllMocks cleared the spy on openai.audio.transcriptions.create too?", "Need to recreate audioSystem or just assume state is fresh..."). Removed the dead first call, the mid-test `clearAllMocks`, and the debate; kept the single real mock setup. Test still passes, now asserts the same thing with no ambiguity about why. |
| **FIX (comments)** | `AudioSystemInworld.test.js` — "should integrate PronunciationUtils to process IPA words" | The final assertion was followed by five lines of comments arguing with itself about whether the assertion actually proved anything ("If words were RESTORED to 'tomato'... Wait, mapSentencesToWords compares whisperTokens... cleaned might not match 'tomato'."). Replaced with one comment stating what the assertion actually verifies (IPA substitution doesn't leak into the broadcast text) — TESTING.md: comments should state the non-obvious *why*, not narrate uncertainty. |
| **FIX (dead code + comments)** | `AudioDrain.test.js` — "should stop generation loop on destroy but allow audio queue to drain" | Captured `const _completionsAtDestroy = [...audioCompletions]` and never used it (the underscore prefix silences the lint rule but doesn't remove the tell). Comments admitted settling for a weaker check than planned ("It's hard to deterministically queue exactly 3... Let's just assert 'No errors thrown' and 'IsLoopActive is false'."). The two assertions that *are* present are actually sound (queue drains an in-flight task after destroy; no new turns generated after destroy — the "zombie loop" check) — removed the dead capture and rewrote the comments to state what's actually being proven instead of narrating the debugging process. |
| **CLEANUP** | `AudioUtils.test.ts` — FFmpeg merge tests | Two `console.log` debug prints (`Merged file size: ...`, `Merged 3 files: ...`) with no diagnostic purpose in CI. Removed. |

## Confirmed clean (read in full, no changes)

- **`AudioSystem.test.js`** — provider-agnostic generation path: generate/broadcast, skip
  when configured, `skipped`-type passthrough, `voiceInstruction`, retry-on-network-error,
  `cancelPendingWork` suppression (both for in-flight and already-cancelled generations), and
  the Inworld-subtitle-timing guard for OpenAI voices.
- **`AudioSystemElevenLabs.test.js`** — request shape and voice settings, ISO language code
  from `voiceLocale`, alias spell-outs (English/Swedish — legitimately different inputs, not
  duplicated coverage), meeting-number spell-out (English/Swedish), native-timings-in-production,
  and API error reporting.
- **`PronunciationUtils.test.ts`** — dense edge-case coverage for a text-normalization utility:
  empty pronunciations, case-insensitive match with restored casing, longest-key-first
  matching, special-character keys, mixed IPA+alias, per-language aliases, regex caching,
  meeting-number spell-out, and Unicode word-boundary handling for Swedish abbreviations
  (`kV` inside vs. outside a word). One behavior per test throughout.
- **`SubtitleTimingValidation.test.ts`**, **`EstimatedSubtitles.test.ts`**,
  **`ElevenLabsAlignmentUtils.test.ts`** — small, precise unit tests for the subtitle-timing
  math (duration-coverage validation, backwards-timing rejection, weighted/minimum/equal-split
  estimation, character-to-word alignment grouping).
- **`audioHttp.integration.test.js`** — real HTTP integration: base64 round-trip with
  Cache-Control/ETag/304, 404 for a missing clip, and 400 for a path-traversal-shaped id
  (a real security-boundary test, not just a validation formality).
