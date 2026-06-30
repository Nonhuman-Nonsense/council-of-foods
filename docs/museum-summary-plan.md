# Museum summary screen — implementation plan

Plan for improving the **museum mode summary overlay**: more protocol space, hardware-button UX, teleprompter scroll, and restart-to-landing — without spreading logic across many small files.

**Related:** [museum-mode-plan.md](./museum-mode-plan.md), [autoplay-plan.md](./autoplay-plan.md), [button-banner-plan.md](./button-banner-plan.md)

---

## Summary

Museum visitors on the summary screen have **no mouse or keyboard** — only the physical button. Today the screen still reserves space for hidden conversation controls and a PDF download button, shows a dismiss **X** they cannot use, and routes button presses to the **meta-agent** (wrong owner). This plan:

1. **PR 1 — Layout:** Hide PDF + controls chrome in museum; extend the protocol area; hide overlay **X**. ✅ Done
2. **PR 2 — Button:** Add `"summary"` button owner (priority 2); claim on `Summary` mount; `ButtonBanner`; **single press → `navigate(rootPath)`**.
3. **PR 3 — Scroll:** `useAudioSyncedScroll` hook — teleprompter padding + audio-clock sync while the summary is read aloud.

Post-landing idle/autoplay is **out of scope** — `AutoplayCoordinator` handles that. Meta-agent keeps its button claim; priority routing avoids release logic there.

---

## Decisions (locked in)

| Topic | Decision |
|-------|----------|
| Restart destination | `navigate(rootPath)` only |
| Meta-agent claim | Keep claiming; `"summary"` wins via priority (no release in meta-agent) |
| Button handling | Inline in `Summary.tsx` |
| Restart UX | **Single press → navigate immediately** (no warning/confirm dialog for now) |
| ButtonBanner on summary | “Press the button to start a new meeting”; **no** `onIdleTerminal` |
| Restart timing | Allowed anytime on summary (including while audio is playing) |
| Button claim | On `Summary` mount when museum + PTT |
| LED | `pulse` while summary is active |
| Teleprompter scroll | New `useAudioSyncedScroll.ts` hook; padding + linear audio-clock sync |
| Swedish copy | Later (English only for now) |
| Escape hatch | Unchanged (`MuseumModeEscapeHatch`) |

---

## Current behavior (problems)

| Area | Today |
|------|--------|
| `Summary.tsx` | Download PDF row + margins for `ConversationControls` (~45–56px) |
| `Council.tsx` | `ConversationControls` mounted with `hidden={isMuseumMode}` — still reserves space |
| `CouncilOverlays.tsx` | `showX={true}` on web; hidden on museum summary ✅ |
| Button | `MeetingMetaAgent` always claims; press while inactive opens **interruption** |
| Scroll | Manual only; long protocols don’t follow voice |

---

## Target UX

### Layout (museum) — PR 1 ✅

- Full-height protocol scroll area (no PDF, no control bar reservation).
- No overlay **X**.
- Web mode unchanged.

### Button + banner (museum PTT) — PR 2

- `useButton("summary")` claims on `Summary` mount when museum + PTT (priority **2** > meta-agent **1**).
- `ButtonBanner`: “Press the button to start a new meeting.”
- **Single button press → `navigate(rootPath)`** immediately.
- LED `pulse` while summary is active.

### Teleprompter scroll (museum) — PR 3

- Top/bottom padding (~35–40% viewport) inside scroll container.
- On audio start: linear `scrollTop` synced to `AudioContext` clock (same idea as `TextOutput`).
- Pause when `isPaused`; no-op if content doesn’t overflow.
- `prefers-reduced-motion`: jump or skip animation.

---

## File map

| File | PR | Role |
|------|-----|------|
| `client/src/council/overlays/Summary.tsx` | 1–3 | Museum layout; button + banner (PR 2); scroll wiring (PR 3) |
| `client/src/council/overlays/CouncilOverlays.tsx` | 1, 3 | Conditional `showX`; pass `audioContext` + playback |
| `client/src/council/Council.tsx` | 3 | `summaryPlayback` state from `Output` callback |
| `client/src/museum/button/buttonStore.ts` | 2 | `"summary"` owner + priority |
| `client/src/council/summaryScrollSync.ts` | 3 | Teleprompter scroll hook + types |
| `client/src/locales/translation_en.json` | 2 | Banner string only |
| Tests | each PR | See PR sections |

**Not creating:** `SummaryButtonHandler.tsx`, restart warning/confirm components.

**Deferred:** Restart confirm/warning dialog (can add later if single-press proves too easy to trigger accidentally).

---

## PR 1 — Museum summary layout ✅

**Goal:** More protocol space; remove unusable chrome.

### Changes

- **`Summary.tsx`:** `useCouncilSettings()` — hide PDF button + hidden PDF template; full-height scroll area; remove bottom margin for controls.
- **`CouncilOverlays.tsx`:** `useCouncilSettings()`; `showX={false}` when museum + summary overlay.

### Tests

- `Summary.test.tsx`: museum — no download button; protocol region present.
- `CouncilOverlays.test.tsx`: museum summary — `showX={false}` on wrapper.

---

## PR 2 — Button owner, banner, single-press restart

**Goal:** Correct button routing; one press returns to landing.

### Flow (museum PTT)

```
Summary mounted (banner visible, LED pulse)
  → button press (rising edge) → navigate(rootPath)
```

### Changes

- **`buttonStore.ts`:** `ButtonOwner` += `"summary"`; priority **2**; update `buttonIntent.test.ts`.
- **`Summary.tsx` (inline):**
  - `useButton("summary")` — claim on mount, release on unmount (`isMuseumMode && agentMode === "ptt"`).
  - `useButtonBanner({ owner: "summary", sessionActive, ... })` — no `onIdleTerminal`.
  - Rising-edge press handler → `navigate(rootPath)` via `useNavigate()` + `useRouting()`.
  - `button.setLed("pulse")` while active.
- **`translation_en.json`:** `summary.banner.pressToRestart` (or similar).

**No `Council.tsx` changes.**

### Tests

- Button priority: summary beats meta-agent.
- Press → `navigate(rootPath)` called once.
- Banner visible on museum PTT summary; web mode: no claim, no banner, press does nothing.

---

## PR 3 — Teleprompter autoscroll

**Goal:** Protocol scroll follows summary narration.

### Changes

- **`summaryScrollSync.ts`:** `computeTeleprompterScrollTop`, `useAudioSyncedScroll`, `SummaryPlaybackState` type.
- **`Output.tsx`:** `onSummaryPlaybackChange` callback when summary audio is active.
- **`Council.tsx`:** `summaryPlayback` state; passes `audioContext` + playback to overlays.
- **`Summary.tsx`:** Teleprompter padding, `scrollRef`, `useAudioSyncedScroll` (museum only).

### Tests

- `summaryScrollSync.test.ts`: scroll math, paused, no playback, active scroll.

---

## Out of scope

- Restart warning / confirm dialog (deferred).
- Meta-agent `release()` on summary.
- `resetStore()` / hard reload on restart.
- Swedish translations.
- Sentence-level scroll (future if markdown + timestamps allow).
- Autoplay / landing behavior after restart.

---

## Implementation status

| PR | Status |
|----|--------|
| PR 1 — Layout | Done |
| PR 2 — Button + restart | Done |
| PR 3 — Teleprompter scroll | Done |
