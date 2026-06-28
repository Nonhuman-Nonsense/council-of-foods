# Autoplay Layer A — auto-forward TODO

Layer A keeps a **live** meeting flowing when the visitor walks away mid-interaction. These are **not** part of the Layer B autoplay PR.

Layer B ([`autoplay-plan.md`](./autoplay-plan.md)) handles leaving interactive mode entirely and looping replays.

**Meeting conclude (wrap-up vs extend):** see [`meeting-conclude-plan.md`](./meeting-conclude-plan.md) — replaces the old “45s auto-wrap on Completed overlay” idea.

---

## Principles

- Do **not** trigger autoplay from these cases — only unstick the current live meeting.
- Prefer existing actions (`handleOnSubmitHumanMessage`, `handleOnConcludeMeeting`, `handleHumanNameEntered`) over new server APIs where possible — **exception:** human abandonment uses `skip_human_turn`.
- Museum-only gates (`isMuseumMode`) unless noted otherwise.
- Timings can be hardcoded next to the component that owns the behaviour (no `global-options` unless we later want install tuning).

---

## Status overview

| Item | Status |
|------|--------|
| Human input / panelist abandonment | **Done** |
| Meeting conclude PR 0 (`CONCLUDE_MEETING`) | **Done** — see [meeting-conclude-plan.md](./meeting-conclude-plan.md) |
| Meeting conclude PR 1–3 (chair line, rename, meta-agent) | **Planned** |
| `Reconnecting` overlay 2 min restart | **Done** |
| Meta-agent interruption idle | **Done** — auto-`continue_meeting` after remind |
| Voice guide stuck mid-setup | **N/A** — `AutoplayCoordinator` (Layer B) |
| `Name` overlay | **N/A** — never shown in museum |
| `Incomplete` overlay | **N/A** — autoplay only plays completed meetings |
| Hash overlays | **N/A** — hidden in museum |
| `Completed` overlay 45s auto-wrap | **Superseded** — conclude agent + PR 0 auto-wrap |

---

## Meeting conclude (summary)

Phased on **`foods-leo`**:

| PR | What |
|----|------|
| **0** | Server auto-wrap when hard cap — no `query_extension`, no overlay |
| **1** | Chair closing statement before summary (`global-options` prompt) |
| **2** | Rename extend/conclude vocabulary — **done** (`extend_meeting`, `conclude_meeting`, `summarizeMeeting*`) |
| **3** | Meta-agent `conclude` mode: `reconfigureSession`, two tools, museum fork at `query_extension` |

Full spec: [`meeting-conclude-plan.md`](./meeting-conclude-plan.md).

---

## Done

### `Reconnecting` overlay

After **2 minutes** in museum mode, `window.location.href = rootPath`. **File:** `Reconnecting.tsx`.

### Human input / panelist abandonment

60s museum PTT idle → `skip_human_turn` → `skipped` + `startLoop()`. **Done.**

### Meta-agent interruption idle

Auto-`continue_meeting` ~10s after idle remind. **Done.**

---

## Not needed (museum)

`Name`, `Incomplete`, hash overlays, voice-guide stuck — see prior notes in git history or meeting-conclude plan.

---

## Out of scope for Layer A

- Idle detection during **live council playback**
- Autoplay loop, random meeting API, button reset to landing — Layer B
