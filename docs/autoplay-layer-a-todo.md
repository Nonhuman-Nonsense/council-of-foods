# Autoplay Layer A — auto-forward TODO

Layer A keeps a **live** meeting flowing when the visitor walks away mid-interaction. These are **not** part of the Layer B autoplay PR.

Layer B ([`autoplay-plan.md`](./autoplay-plan.md)) handles leaving interactive mode entirely and looping replays.

---

## Principles

- Do **not** trigger autoplay from these cases — only unstick the current live meeting.
- Prefer existing actions (`handleOnSubmitHumanMessage`, `handleOnGenerateSummary`, `handleHumanNameEntered`) over new server APIs where possible — **exception:** human abandonment uses `skip_human_turn`.
- Museum-only gates (`isMuseumMode`) unless noted otherwise.
- Timings can be hardcoded next to the component that owns the behaviour (no `global-options` unless we later want install tuning).

---

## Status overview

| Item | Status |
|------|--------|
| Human input / panelist abandonment | **Done** |
| `Completed` overlay auto-wrap | **Open** — next up |
| `Reconnecting` overlay 2 min restart | **Open** — simple fallback |
| Meta-agent long idle | **Done** — auto-continue after idle remind |
| Voice guide stuck mid-setup | **N/A** — covered by `AutoplayCoordinator` (Layer B) |
| `Name` overlay | **N/A** — never shown in museum (name known before council) |
| `Incomplete` overlay | **N/A** — autoplay only plays completed meetings |
| Hash overlays (`#about`, `#contact`) | **N/A** — hidden in museum mode |

---

## Open items

### `Completed` overlay (`max_reached`)

**When:** `activeOverlay === "completed"`, museum mode, no user choice for ~45s.

**Desired behaviour:** Auto-call `handleOnGenerateSummary` / “Wrap it up” so the meeting proceeds to summary without a click.

**Notes:** Listed in museum-mode-plan Phase 4.2. Visitor may still listen through summary; Layer B idle on summary handles autoplay afterward.

**Likely files:** `client/src/council/overlays/Completed.tsx` or `CouncilOverlays.tsx`, or museum wrapper in `Council.tsx`.

---

### `Reconnecting` overlay

**When:** Connection error persists, museum mode — overlay shows while the client keeps retrying.

**Current behaviour:** Reconnects indefinitely (acceptable).

**Desired addition:** After **2 minutes** on the reconnecting overlay, hard-restart the kiosk: `window.location.reload()` (full page reload, fresh start). Simple fallback if the socket never recovers.

**Likely files:** `client/src/main/overlay/Reconnecting.tsx`, `Main.tsx` (museum gate).

---

## Done

### Human input / panelist abandonment

Museum PTT idle (**60s** after button release, active phase only) → `onAbandonHumanTurn` → `skip_human_turn` → server pushes `skipped`, clears `handRaised`, `startLoop()`. Skipped turns count in speaker rotation and panelist invitation logic.

**Key files:** `HumanInput.tsx`, `useCouncilMachine.ts`, `HumanInputHandler.ts`, `SocketTypes.ts`.

---

### Meta-agent long idle

`MeetingMetaAgent` auto-`continue_meeting` ~10s after `BUTTON_IDLE_REMIND_MS` idle remind. No further Layer A work.

---

## Not needed (museum)

### `Name` overlay

Visitor name is always known before council in museum mode; the name overlay does not surface. No auto-forward timer required.

### `Incomplete` overlay

Layer B autoplay only samples **completed** meetings, so the incomplete replay prompt cannot appear on museum kiosks.

### Hash overlays (`#about`, `#contact`)

About/contact entry points are hidden in museum mode. No auto-close timer required.

### Voice guide stuck mid-setup

Layer B `AutoplayCoordinator` idle → warning → replay already tears down a stuck setup session. No separate Layer A handler.

---

## Out of scope for Layer A

- Idle detection during **live council playback** — intentional omission; meeting should play through to summary, then Layer B applies.
- Autoplay loop, random meeting API, button reset to landing — Layer B.
