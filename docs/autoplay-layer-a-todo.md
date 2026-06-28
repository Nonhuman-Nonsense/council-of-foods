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
| Meeting conclude PR 0 (`CONCLUDE_MEETING`) | **Done** |
| Meeting conclude PR 1 (chair closing line) | **Done** |
| Meeting conclude PR 2 (vocabulary rename) | **Done** — merged to forest-leo |
| Meeting conclude PR 3 (meta-agent extension phase) | **Next** — foods-leo |
| `Reconnecting` overlay 2 min restart | **Done** |
| Meta-agent interruption idle | **Done** — auto-`resume_meeting` after remind |
| Voice guide stuck mid-setup | **N/A** — `AutoplayCoordinator` (Layer B) |
| `Name` overlay | **N/A** — never shown in museum |
| `Incomplete` overlay | **N/A** — autoplay only plays completed meetings |
| Hash overlays | **N/A** — hidden in museum |
| `QueryExtension` overlay 45s auto-conclude | **Superseded** — PR 0 hard cap + PR 3 museum agent |

---

## Meeting conclude (summary)

Phased on **`foods-leo`**:

| PR | What | Status |
|----|------|--------|
| **0** | Server auto-conclude when hard cap — no `query_extension`, no overlay | **Done** |
| **1** | Chair closing statement before summary (`concludeMeetingPrompt`) | **Done** |
| **2** | Rename extend/conclude/summarize vocabulary | **Done** (forest merged) |
| **3** | Meta-agent `extension` phase: `reconfigureSession`, two tools, museum fork in state machine | **Next** |

Full spec: [`meeting-conclude-plan.md`](./meeting-conclude-plan.md).

---

## Done

### `Reconnecting` overlay

After **2 minutes** in museum mode, `window.location.href = rootPath`. **File:** `Reconnecting.tsx`.

### Human input / panelist abandonment

60s museum PTT idle → `skip_human_turn` → `skipped` + `startLoop()`. **Done.**

### Meta-agent interruption idle

Auto-`resume_meeting` ~10s after idle remind. **Done.**

---

## Not needed (museum)

`Name`, `Incomplete`, hash overlays, voice-guide stuck — see prior notes in git history or meeting-conclude plan.

---

## Out of scope for Layer A

- Idle detection during **live council playback**
- Autoplay loop, random meeting API, button reset to landing — Layer B
