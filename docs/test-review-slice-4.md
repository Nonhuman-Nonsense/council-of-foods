# Test review — slice 4: council playback machine + overlays

> **Status: applied.** All verdicts below (including the optional minor consolidations)
> were applied. Full client suite: 844 → 838 tests, all green; type-check clean; the two
> lint findings in this slice's files are pre-existing (present on baseline). The two
> pause/resume matrices are now `it.each` tables; the dead `transitions to playing` test now
> asserts the loading→playing transition and `playingNowIndex`.

Verdicts against [TESTING.md](../TESTING.md). Files reviewed:
`client/tests/unit/hooks/useCouncilMachine.test.tsx`, `components/Council.test.tsx`,
`components/CouncilOverlays.test.tsx`, `components/Overlay.test.tsx`,
`components/OverlayWrapper.test.tsx`, `components/overlays/{About,Contact,Incomplete,Name,Summary}`,
`main/overlay/{CouncilError,Reconnecting,errorStore}`,
`council/{participationPhase,summaryScrollSync}`.

**Overall:** this slice is healthier than its size suggested. The intent-reconciler suites
are the executable form of the RESILIENCE.md contract and are the best tests in the client.
The problems are concentrated in the auto-pause/auto-resume block (a matrix written as ~18
prose tests), one dead test, one exact duplicate, and a handful of render-y or
mock-plumbing cases.

## useCouncilMachine.test.tsx (73 cases, 2007 lines)

| verdict | tests | reason |
|---|---|---|
| **REWRITE** | `transitions to playing when audio and text are available` | **Dead test — zero assertions.** The body trails off into commented-out questions and always passes. This is the machine's single most important transition; implement it properly (the fake-timer pattern from the deferred-connection-error tests does it in ~10 lines). |
| **DELETE** | `museum mode transitions interruption to extension at soft cap` | Exact duplicate of `museum mode with ptt activates meta-agent extension…` — same arrange/act, strict subset of its assertions. |
| **MERGE → table** | the ~16 single-transition auto-pause/resume cases (`auto-pauses when location hash is set`, `…connection error is set`, `…tab is hidden` ×2, `…council overlay opens`, `…name overlay opens`, `resumes in museum when hash overlay dismissed` ×2 (only the hash string differs: `#staff` vs `#about`), `stays paused in web when hash dismissed`, `resumes when connection error clears` ×2, `resumes/stays on tab visibility` ×2, `stays paused: hash clears but tab hidden`, `stays paused: tab refocus but hash open`, `stays paused when council overlay dismissed` ×2 | One `it.each` table over `{trigger, mode, initialPaused, expected}` — every row becomes one line, the full matrix becomes visible on one screen, and future agent sessions add rows instead of 40-line prose tests. |
| **KEEP (standalone)** | `resumes in museum when the last stacked environmental interrupt clears`; `does not auto-resume in museum while pausing council overlay open` ×2; `does not auto-pause for summary overlay` | Multi-step sequences, don't fit the table shape. |
| **MERGE** | `initializes with loading state` + `exposes currentMeetingId from props in state` → one `initial state` test | Two trivial assertions on the same render. |
| **MERGE** | `transitions to human_panelist state when awaiting_human_panelist is next` → drop; its assertion is already step 1 of `submits human panelist message correctly` | Same behavior proven twice. |
| **KEEP** | everything else: deferred connection-error block (4), overlay-action-resume block (3), mute toggle, query_extension trio, extend/conclude emission, panelist submit/abandon + both unrecoverable-error guards, reconnect emission (2), played-index reporting (2), resume flow (3), raise-hand name overlay (2), and all four intent-reconciler describes (16) | Contract-level state-machine behavior; the reconciler tests encode RESILIENCE.md and their comments explain *why* — exemplary. |

Net: 73 → ~55 cases, same behavioral coverage, file drops well under 1500 lines.

## Council.test.tsx (11 cases)

- **DELETE** `passes lifted runtime state into useCouncilMachine` — asserts the mocked
  hook's call arguments; pure prop-plumbing mirror (TESTING.md tier 4). It only fails on a
  rename, which TypeScript already catches.
- **KEEP** the rest: mute wiring and museum-hidden controls are observed through rendered
  output; replay-manifest load, human_panelist error guard, HumanInput mount matrix (3),
  meta-agent unmount, unmount cleanup are all boundary behavior.

## Keep as-is (no changes)

- **CouncilOverlays.test.tsx** (8) — overlay dispatch + callbacks exercised via real clicks;
  museum/web close-button rule is a kiosk contract.
- **Incomplete.test.tsx** (2), **CouncilError.test.tsx** (4 — museum health-probe/reload
  behavior, kiosk-critical), **errorStore.test.ts** (12 — refcounted connection-error
  semantics that the deferred overlay depends on), **participationPhase.test.ts** (11 — pure
  matrix; optionally `it.each`, not required), **summaryScrollSync.test.ts** (14).
- **Overlay.test.tsx / OverlayWrapper.test.tsx** — small and contract-shaped
  (pointer-events/blur/close-button). The inventory's duplicate-name flag (`renders children
  correctly` in both) is a name collision between different components, not duplication.

## Minor consolidations (optional, same PR)

- **Reconnecting.test.tsx**: merge the three static render checks (heading, sub-text,
  spinner) into one; keep the three museum reload-escalation tests untouched.
- **Summary.test.tsx**: fold `includes the disclaimer` and `renders the hidden PDF template`
  assertions into `renders summary content correctly`; keep all behavioral cases (PDF
  download, museum hiding, button claim, auto-return timers).
- **Name.test.jsx**: fold `renders correctly` into the first validation test.
- **Contact.test.tsx**: merge 3 render cases into 1.

## Not in this slice

`components/MainOverlays.test.tsx` (hash-routing overlays) fits slice 6 (routing) better;
`overlays/Summary.test.tsx` museum-button cases overlap slice 5 — reviewed here anyway since
the file is overlay-owned.
