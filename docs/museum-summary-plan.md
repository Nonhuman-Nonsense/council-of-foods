# Museum summary screen — implementation plan

Plan for improving the **museum mode summary overlay**: more protocol space, hardware-button UX, teleprompter scroll, and restart-to-landing — without spreading logic across many small files.

**Related:** [museum-mode-plan.md](./museum-mode-plan.md), [autoplay-plan.md](./autoplay-plan.md), [button-banner-plan.md](./button-banner-plan.md)

---

## Summary

Museum visitors on the summary screen have **no mouse or keyboard** — only the physical button. Today the screen still reserves space for hidden conversation controls and a PDF download button, shows a dismiss **X** they cannot use, and routes button presses to the **meta-agent** (wrong owner). This plan:

1. **PR 1 — Layout:** Hide PDF + controls chrome in museum; extend the protocol area; hide overlay **X**.
2. **PR 2 — Button:** Add `"summary"` button owner (priority 2); handle press + `ButtonBanner` + inline restart warning in `Summary.tsx` (AutoplayWarning-style: 1st press → warning, 2nd press → cancel, N s timeout → `navigate(rootPath)`).
3. **PR 3 — Scroll:** `useAudioSyncedScroll` hook — teleprompter padding + audio-clock sync while the summary is read aloud.

Post-landing idle/autoplay is **out of scope** — `AutoplayCoordinator` handles that. Meta-agent keeps its button claim; priority routing avoids release logic there.

---

## Decisions (locked in)

| Topic | Decision |
|-------|----------|
| Restart destination | `navigate(rootPath)` only |
| Meta-agent claim | Keep claiming; `"summary"` wins via priority (no release in meta-agent) |
| Button handling | Inline in `Summary.tsx` |
| Restart warning UI | Inline in `Summary.tsx`, full-screen overlay (like `AutoplayWarning`) |
| Restart confirm | **Option C:** 1st press → warning; 2nd press → cancel; **N s timeout → navigate** (same pattern as autoplay warning) |
| ButtonBanner on summary | “Press the button to start a new meeting”; **no** `onIdleTerminal` |
| Restart during summary audio | Not allowed once narration has started |
| LED during restart warning | `pulse` (button feels responsive) |
| Teleprompter scroll | New `useAudioSyncedScroll.ts` hook; padding + linear audio-clock sync |
| Swedish copy | Later (English only for now) |
| Escape hatch | Unchanged (`MuseumModeEscapeHatch`) |

---

## Current behavior (problems)

| Area | Today |
|------|--------|
| `Summary.tsx` | Download PDF row + margins for `ConversationControls` (~45–56px) |
| `Council.tsx` | `ConversationControls` mounted with `hidden={isMuseumMode}` — still reserves space |
| `CouncilOverlays.tsx` | `showX={true}` always |
| Button | `MeetingMetaAgent` always claims; press while inactive opens **interruption** |
| Scroll | Manual only; long protocols don’t follow voice |

---

## Target UX

### Layout (museum)

- Full-height protocol scroll area (no PDF, no control bar reservation).
- No overlay **X**.
- Web mode unchanged.

### Button + banner (museum PTT)

- `useButton("summary")` claims while summary overlay is shown (priority **2** > meta-agent **1**).
- `ButtonBanner`: idle copy — press to start a new meeting.
- **Before summary audio starts:** button inactive for restart (banner may still show).
- **After audio finishes** (or when restart is allowed — see PR 2 wiring): first press → full-screen restart warning; second press → dismiss; **10s timeout** → `navigate(rootPath)`; LED `pulse` during warning.

### Teleprompter scroll (museum)

- Top/bottom padding (~35–40% viewport) inside scroll container.
- On audio start: linear `scrollTop` synced to `AudioContext` clock (same idea as `TextOutput`).
- Pause when `isPaused`; no-op if content doesn’t overflow.
- `prefers-reduced-motion`: jump or skip animation.

---

## File map

| File | PR | Role |
|------|-----|------|
| `client/src/council/overlays/Summary.tsx` | 1–3 | Museum layout; button/banner/warning (PR 2); scroll wiring (PR 3) |
| `client/src/council/overlays/CouncilOverlays.tsx` | 1 | `isMuseumMode`, conditional `showX` |
| `client/src/council/Council.tsx` | 1, 3 | Skip controls on museum summary; pass props |
| `client/src/museum/button/buttonStore.ts` | 2 | `"summary"` owner + priority |
| `client/src/hooks/useAudioSyncedScroll.ts` | 3 | Teleprompter scroll hook (new) |
| `client/src/locales/translation_en.json` | 2 | Banner + warning strings |
| Tests | each PR | See PR sections |

**Not creating:** `SummaryButtonHandler.tsx`, `SummaryRestartWarning.tsx`.

---

## PR 1 — Museum summary layout

**Goal:** More protocol space; remove unusable chrome. No button or scroll behavior yet.

### Changes

- **`Summary.tsx`:** `useCouncilSettings()` — hide PDF button + hidden PDF template; full-height scroll area; remove bottom margin for controls.
- **`CouncilOverlays.tsx`:** `useCouncilSettings()`; `showX={false}` when museum + summary overlay.

### Tests

- `Summary.test.tsx`: museum — no download button; protocol region present.
- `CouncilOverlays.test.tsx`: museum summary — `showX={false}` on wrapper.
- `Council.test.tsx`: museum — controls stay hidden via `hidden` prop (unchanged).

### Review focus

Visual/layout only; web regression check.

---

## PR 2 — Button owner, banner, restart warning

**Goal:** Correct button routing and restart-to-landing from summary.

### Changes

- **`buttonStore.ts`:** `ButtonOwner` += `"summary"`; priority **2**; update `buttonIntent.test.ts`.
- **`Summary.tsx` (inline):**
  - `useButton("summary")` claim/release when `isMuseumMode`.
  - `useButtonBanner` with new i18n key; no `onIdleTerminal`.
  - Press edge: open warning / cancel / timeout → `onRestart` callback.
  - Inline `RestartWarning` overlay (AutoplayWarning layout; display-only in museum).
  - Gate restart when summary audio is playing.
- **`Council.tsx` / `CouncilOverlays.tsx`:** `onRestart={() => navigate(rootPath)}`.
- **`translation_en.json`:** `summary.banner.*`, `summary.restartWarning.*`.

### Tests

- Button priority: summary beats meta-agent.
- Press → warning → second press cancel; timeout navigates.
- Banner visible in museum summary.

---

## PR 3 — Teleprompter autoscroll

**Goal:** Protocol scroll follows summary narration.

### Changes

- **`useAudioSyncedScroll.ts`:** New hook (~60–80 lines).
- **`Summary.tsx`:** Padding on scroll container; hook + `scrollRef`.
- **`Council.tsx`:** Pass `playbackStartInfo`, duration, `isPaused`, `audioContext` from `Output` playback path.

### Tests

- Hook: progress → `scrollTop`, overflow guard, paused.

---

## Out of scope

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
| PR 2 — Button + restart | Not started |
| PR 3 — Teleprompter scroll | Not started |
