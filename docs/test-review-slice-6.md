# Test review — slice 6: routing, i18n, setup flow

> **Status: applied.** Full client suite: 836 → 835 tests, all green; type-check and lint
> clean.

Verdicts against [TESTING.md](../TESTING.md). Files reviewed: `routing.test.ts`,
`routing.singleLanguage.test.ts`, `routing.multilanguage.test.ts`, `locales.test.ts`,
`components/RouterLogic.test.tsx`, `components/MainOverlays.test.tsx`, `meetingSetup.test.ts`,
`newMeeting/meetingSetupStore.test.ts`, `components/MeetingSetupReset.test.tsx`,
`components/NewMeeting.creatorKey.test.tsx`, `components/settings/{Landing,SelectFoods,
SelectTopic}.test.tsx`, `settings/councilSettings.test.tsx`,
`navigation/{probeOriginHealth,reloadApp}.test.ts` — 16 files, ~99 cases.

**Overall:** the cleanest slice so far. This area (routing, locale integrity, meeting setup,
app settings) is mostly small, well-scoped pure-function and hook tests with one behavior
per test; the larger files (`SelectTopic.test.tsx` at 409 lines, `councilSettings.test.tsx`
at 256) earned their size through genuinely distinct behaviors (layout thresholds, hover/
selection priority, per-storage-key persistence tables), not repetition — confirmed by
reading every case, not just the line counts the mechanical inventory flagged.

## Findings

| verdict | file | reason |
|---|---|---|
| **MERGE** | `components/settings/Landing.test.tsx` | `"renders welcome message"` and `"renders \"Go\" button in landscape mode"` rendered `<Landing />` under the exact same default mock state (landscape, non-mobile, non-museum) and asserted different elements of the same render. Folded into one test. |

## Confirmed clean (read in full, no changes)

- `routing.test.ts` / `routing.singleLanguage.test.ts` / `routing.multilanguage.test.ts` —
  the single- and multi-language files test the same `buildLanguagePath`/`useSwitchLanguage`
  functions but under different `AVAILABLE_LANGUAGES` mocks; behavior genuinely differs by
  deployment config (this is the same kind of legitimate split as museum vs. web mode
  elsewhere in the suite), not duplication.
- `locales.test.ts` — cheap, high-value contract tests (locale file exists per language, keys
  match across languages, every key used in source is defined). Tier 2 in TESTING.md's value
  hierarchy.
- `components/RouterLogic.test.tsx` — single-language vs. multi-language route/navbar
  behavior, all distinct cases.
- `components/MainOverlays.test.tsx` (deferred here from slice 4) — 10 cases, one per
  hash-routing branch (`#about`, `#contact`, `#staff` on root vs. non-root, `#settings` on
  meeting vs. non-meeting paths, `#reset`, invalid hash). No overlap.
- `meetingSetup.test.ts`, `newMeeting/meetingSetupStore.test.ts` — pure prompt-building and
  store-reset logic, one behavior per test.
- `components/MeetingSetupReset.test.tsx`, `components/NewMeeting.creatorKey.test.tsx` —
  distinct multi-step integration scenarios (setup-state reset on navigation, live-key
  handoff to the meeting route); each earns its size.
- `components/settings/SelectFoods.test.tsx`, `components/settings/SelectTopic.test.tsx` —
  large but each case is a distinct interaction (min/max participant limits, duplicate-name
  validation, custom-topic entry, grid layout at the 6-topic threshold, hover/selection
  tooltip priority, museum-mode hiding). No redundant cases found.
- `settings/councilSettings.test.tsx` — organized as one `describe` per storage key
  (agent mode, PTT hardware, museum switch button, dev log), each with default/persist/edge
  cases, plus a `useCouncilSettings` block for cross-instance sync. Already table-shaped in
  spirit; no consolidation needed.
- `navigation/probeOriginHealth.test.ts`, `navigation/reloadApp.test.ts` — small, one
  behavior per test, kiosk-relevant (health probe timeout/failure, museum reload escalation).
