# Test review — slice 5: museum / button / kiosk

> **Status: applied.** Full client suite: 838 → 836 tests, all green; type-check and lint
> clean.

Verdicts against [TESTING.md](../TESTING.md). Files reviewed: everything under
`client/tests/unit/museum/` (button, metaAgent, and the top-level museum switch/cursor
tests) — 18 files, ~169 cases before this review.

**Overall:** this slice grew substantially since the original inventory (a button-bridge
health check, LED debug overlay, and wire protocol test all landed since). Despite several
pairs of similarly-named files, almost all of it is legitimate: this module has a real
hook/component split (`useButtonBanner` vs `ButtonBanner`, `buttonDebug`'s logic vs its
`ButtonLedDebugOverlay` component) and a real unit/integration split (`buttonIntent`'s pure
priority functions vs `buttonIntentIntegration`'s multi-hook Council scenario). Confirmed by
reading both sides of every pair, cross-referenced against source exports.

## Findings

| verdict | files | reason |
|---|---|---|
| **DELETE** | `client/tests/unit/museum/button/useBridgeHealth.test.ts` | Exact duplicate of `bridgeHealth.test.ts` — both import `fetchButtonBridgeHealth` and cover the identical two scenarios (healthy response → `running`, fetch rejection → `not_running`) with only cosmetic differences in mock data. Kept `bridgeHealth.test.ts`: its describe block name matches the actual exported function (`useBridgeHealth.test.ts`'s `"useButtonBridgeHealth integration"` describe was a misnomer — there is no such hook, it tests the same plain async function). |
| **SIMPLIFY** | `client/tests/unit/museum/button/bridgeTransport.test.ts` | Two inline mock WebSocket classes (`MockWebSocketNoSerial`, `DeferredStatusWebSocket`) were each defined byte-identically twice, inside two different `it` blocks. Extracted each to a single module-level class with a `.reset()` call at the top of each test that uses it. No test behavior or count changed — pure boilerplate reduction (~60 lines). |
| **MOVE** | `client/tests/unit/museum/metaAgent/MeetingMetaAgent.test.tsx` → `client/tests/unit/museum/button/buttonBanner.test.ts` | `"cancels resume when idle remind is reset before timeout"` lived inside `MeetingMetaAgent.test.tsx`'s `describe("idle auto-resume")` block but never rendered `<MeetingMetaAgent />` — it called `renderHook(() => useButtonBanner(...))` directly, exactly like the adjacent `describe("useButtonBanner")` tests in `buttonBanner.test.ts`. Moved it there (renamed for clarity: `"cancels onIdleTerminal when activity is bumped after the remind has already fired"`) since that's the file that owns `useButtonBanner`'s behavior; removed the now-unused `renderHook`/`useButtonBanner` imports from `MeetingMetaAgent.test.tsx`. |

## Confirmed non-duplicates (read both sides, no changes)

- `buttonBanner.test.ts` (hook: idle timing, visibility computation, store sync) vs
  `ButtonBanner.test.tsx` (component: renders from store state) — different modules
  (`useButtonBanner.ts` vs `ButtonBanner.tsx`).
- `buttonLedDebug.test.ts` (storage/event logic in `buttonDebug.tsx`) vs
  `ButtonLedDebugOverlay.test.tsx` (the same file's default-exported component) — logic vs
  render, same split pattern as above.
- `buttonIntent.test.ts` (pure `mergeButtonOwner`/`resolveAppliedLedMode` priority functions,
  in isolation) vs `buttonIntentIntegration.test.tsx` (multi-hook scenario mirroring real
  Council usage across warm/active phase handoff) — unit vs integration, not overlapping.
- `buttonStore.test.ts` vs `useButton.test.ts` share one test name
  (`"keeps owner when claimed with off LED"`) but exercise different layers: the store
  directly vs the hook's delegation to the store. Same "does not send LED commands..." name
  also appears in `bridgeTransport.test.ts` at the transport layer — three-tier defense in
  depth (transport won't send → store won't call transport → hook delegates to store),
  consistent with the reconciler pattern kept in slice 4. Left as-is.
- `protocol.test.ts` (new) — cheap contract test of the shared wire protocol
  (`shared/buttonProtocol.ts`), tier 2 in TESTING.md's value hierarchy. Keep.
- `museumButton.test.tsx` (new) — `MuseumButton`'s connect/disconnect lifecycle wiring to
  app-mode/agent-mode/PTT-hardware settings changes. Kiosk-critical, contract-shaped. Keep.
- `metaAgentPrompt.test.ts`, `metaAgentTools.test.ts`, `useMetaAgent.test.ts`,
  `MuseumSwitchButton.test.tsx`, `useMuseumCursorHide.test.ts` — one behavior per test,
  no redundancy found. `metaAgentPrompt.test.ts` asserts specific prompt content, but that
  module's contract *is* the text it generates (a prompt-builder), unlike the "never assert
  prompt wording" rule in TESTING.md, which targets tests of other modules that merely call
  an LLM.
- `MeetingMetaAgent.test.tsx` (578 lines, 23 cases after the move) — large but each case is
  a distinct kiosk lifecycle behavior (PTT ownership handoff, interruption/extension phase
  transitions, idle auto-resume timing). No consolidation candidates found.
