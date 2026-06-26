# Autoplay Layer A — auto-forward TODO

Layer A keeps a **live** meeting flowing when the visitor walks away mid-interaction. These are **not** part of the Layer B autoplay PR. Implement here when museum installs need them.

Layer B ([`autoplay-plan.md`](./autoplay-plan.md)) handles leaving interactive mode entirely and looping replays.

---

## Principles

- Do **not** trigger autoplay from these cases — only unstick the current live meeting.
- Prefer existing actions (`handleOnSubmitHumanMessage`, `handleOnGenerateSummary`, `handleHumanNameEntered`) over new server APIs where possible.
- Museum-only gates (`isMuseumMode`) unless noted otherwise.
- Timings can be hardcoded next to the component that owns the behaviour (no `global-options` unless we later want install tuning).

---

## TODO items

### Human input / panelist abandonment

**When:** `councilState` is `human_input` or `human_panelist`, participation phase is `active`, no PTT activity for ~60–90s.

**Desired behaviour:** Auto-continue the meeting — skip the visitor's turn and resume council playback.

**Notes:**

- `HumanInput` already has finishing timers for PTT release; this is the *no press at all* case.
- Options: museum auto-submit with a skip phrase, or a small `skip_human_turn` socket event if we want clean transcripts.
- **Does not** enter autoplay.

**Likely files:** `client/src/council/humanInput/HumanInput.tsx`, possibly `useCouncilMachine.ts` or server `HumanInputHandler.ts` if new socket event.

---

### `Completed` overlay (`max_reached`)

**When:** `activeOverlay === "completed"`, museum mode, no user choice for ~45s.

**Desired behaviour:** Auto-call `handleOnGenerateSummary` / “Wrap it up” so the meeting proceeds to summary without a click.

**Notes:** Listed in museum-mode-plan Phase 4.2. Visitor may still listen through summary; Layer B idle on summary handles autoplay afterward.

**Likely files:** `client/src/council/overlays/Completed.tsx` or `CouncilOverlays.tsx`, or museum wrapper in `Council.tsx`.

---

### `Incomplete` overlay (replay resume prompt)

**When:** Replay manifest ends incomplete, overlay shown, museum mode, idle ~45s.

**Desired behaviour:** TBD — auto-dismiss (“Never mind”) vs auto-resume. Replay incomplete is rare on museum kiosks if Layer B only samples completed meetings.

**Likely files:** `client/src/council/overlays/Incomplete.tsx`.

---

### `Name` overlay before raise-hand

**When:** `activeOverlay === "name"`, museum mode, idle ~30s.

**Desired behaviour:** Auto-continue with `visitorName` from `useMeetingSetupStore` (museum-mode-plan 4.2). Raise-hand UI is hidden in museum, but edge cases may still surface the overlay.

**Likely files:** `useCouncilMachine.ts` or `CouncilOverlays.tsx`.

---

### Meta-agent long idle

**When:** Meta-agent session active, visitor does not PTT after idle reminder.

**Status:** Partially done — `MeetingMetaAgent` auto-`continue_meeting` ~10s after `BUTTON_IDLE_REMIND_MS` idle remind.

**Follow-up:** Confirm behaviour is sufficient for installs; tune timing if needed.

**Likely files:** `client/src/museum/metaAgent/MeetingMetaAgent.tsx`.

---

### Voice guide stuck mid-setup

**When:** Voice guide is connected but setup UI state stops advancing (tool failure, visitor confusion), museum mode.

**Desired behaviour:** TBD — optional nudge or fallback topic/character defaults. Distinct from Layer B idle (which eventually tears down voice guide via autoplay).

**Likely files:** `MeetingVoiceGuide.tsx`, `guideTools.ts`.

---

### `Reconnecting` overlay

**When:** Connection error persists, museum mode.

**Desired behaviour:** TBD — auto-retry vs return to landing after timeout. May overlap with `CouncilError` auto-restart.

**Likely files:** `client/src/main/overlay/Reconnecting.tsx`, `Main.tsx`.

---

### Hash overlays (`#about`, `#contact`)

**When:** Incidental hash navigation without navbar in museum.

**Desired behaviour:** Auto-close overlay (museum-mode-plan 4.4).

**Likely files:** `client/src/main/overlay/MainOverlays.tsx`.

---

## Out of scope for Layer A

- Idle detection during **live council playback** — intentional omission; meeting should play through to summary, then Layer B applies.
- Autoplay loop, random meeting API, button reset to landing — Layer B.
