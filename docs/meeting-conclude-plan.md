# Meeting conclude flow — implementation plan

Museum installs should not use the `Completed` overlay for wrap-up vs extend. When the soft cap is hit and extension is still allowed, the **meta-agent** (chair voice) asks the visitor; the agent calls one of two tools. When extension is not allowed, the server skips the choice entirely.

**Branch:** `foods-leo` first.

**Related:** [autoplay-layer-a-todo.md](./autoplay-layer-a-todo.md) (Layer A), [meta-agent-realtime-ux-plan.md](./meta-agent-realtime-ux-plan.md).

---

## Architecture decisions (locked)

### Keep `councilState`; add `metaAgentMode`

| State | Role |
|-------|------|
| `councilState === 'max_reached'` | Playback cursor is on the `max_reached` sentinel; meeting is at soft cap. **Unchanged** — do not add a new council state. |
| `metaAgentMode` | Orthogonal meta-agent job: `'interruption'` (default) \| `'conclude'`. Lives next to `metaAgentActive` (Council / `MeetingMetaAgent`). |
| `metaAgentActive` | UI + WebRTC session visible; meeting output hidden; chair zoom. Same as today. |

**Fork point** — `useCouncilMachine` `case 'max_reached':` (~387–395):

| Condition | Action |
|-----------|--------|
| Web (not museum) | `setActiveOverlay('completed')` — unchanged |
| Museum + `canExtendMeeting` | Do **not** set overlay; Council sets `metaAgentMode = 'conclude'` + `metaAgentActive = true` |
| Museum + `!canExtendMeeting` | Should not happen after **PR 0** (server auto-concludes) |

Do **not** infer conclude mode from `max_reached && metaAgentActive` alone — explicit `metaAgentMode` keeps interruption vs conclude separate and extensible.

### `reconfigureSession` on mode change

When `metaAgentMode` changes while the WebRTC session is connected:

1. `instructions` + `tools` update via `useMemo` (mode-specific prompt bundle).
2. `useEffect([metaAgentMode])` → `reconfigureSession()` (`session.update` on the existing data channel).
3. On `session.updated` (event loop already handles this), run mode-specific activation (STATE SYNC + synthetic user turn + `response.create`).

**Conclude activation:** chair speaks **first** without a button press (programmatic path, separate from PTT rising-edge interruption activation).

### Conclude-mode tools (agent must call exactly one)

Initial names (PR 3); renamed in **PR 2**:

| PR 3 name | PR 2 name | Client handler today |
|-----------|-----------|----------------------|
| `extend_meeting` | `continue_more` (TBD exact slug) | `handleOnContinueMeetingLonger` → `continue_conversation` |
| `conclude_meeting` | `wrap_up` / `wrap_up_meeting` (TBD) | `handleOnGenerateSummary` → `wrap_up_meeting` |

Conclude mode exposes **only these two** tools (no `continue_meeting`, no `restart_meeting`). Interruption mode keeps today’s `continue_meeting` + `restart_meeting`.

When `canExtendMeeting === false`, conclude agent is never shown (PR 0).

### Idle timeout (conclude mode only)

Mirror interruption idle remind pattern (`MeetingMetaAgent` ~10s after `BUTTON_IDLE_REMIND_MS`), but:

- **Do not** auto-call `continue_meeting`.
- If visitor never engages after remind → auto-call **`conclude_meeting`** handler (same as wrap-up button).

Disable interruption auto-resume while `metaAgentMode === 'conclude'`.

### Layer B / autoplay

Bump autoplay activity when conclude agent activates so wrap-up dialogue does not trigger idle replay. (Detail in implementation.)

---

## PR sequence

### PR 0 — Auto-conclude when extension impossible (no agent)

**Goal:** If the meeting hits the hard cap (`canContinue === false`), skip `max_reached` UX entirely — server goes straight to wrap-up.

**Server** (`MeetingManager` `END_CONVERSATION` or lifecycle):

- When `conversationMaxLength + conversationExtraSlots >= meetingVeryMaxLength`, do **not** push `{ type: 'max_reached', canContinue: false }`.
- Instead invoke wrap-up path directly (`handleWrapUpMeeting` with server-side date, or shared internal helper).
- Client receives `conversation_update` with summary (or loading → summary) — no Completed overlay, no museum agent.

**Client:** Optional guard — if `max_reached` arrives with `canContinue: false` in museum, auto-call `handleOnGenerateSummary` as belt-and-suspenders.

**Tests:** `ConversationFlow.test.js`, `MeetingLifecycleHandler.test.js` — at absolute cap, no `max_reached` sentinel; summary appended.

**No meta-agent changes.**

---

### PR 1 — Chair closing statement before summary

**Goal:** When conclude/wrap-up runs, chair speaks one final in-character line **before** the summary message (orthogonal to agent).

**Server:**

- New prompt in `server/global-options.json` (e.g. `concludeMeetingPrompt` + `concludeMeetingLength`), distinct from `finalizeMeetingPrompt`.
- `handleWrapUpMeeting`: after stripping `max_reached`, generate chair **closing statement** (`type: 'message'` or dedicated type if needed), push + TTS, **then** generate summary as today.

**Client:** Playback flows through closing statement → summary (existing state machine).

**Tests:** lifecycle handler — conversation shape `[…, closing, summary]`; audio queued for both.

**Implement before PR 3** so agent-triggered conclude uses the same path.

---

### PR 2 — Rename conclude/extend vocabulary

**Goal:** Clearer names for humans and for a future agent.

| Old | New (direction) |
|-----|-----------------|
| `extend_meeting` / `handleOnContinueMeetingLonger` | `continue_more` (tool + logs; socket stays `continue_conversation`) |
| `conclude_meeting` / `handleOnGenerateSummary` | `wrap_up` / `wrap_up_meeting` (tool; socket stays `wrap_up_meeting`) |

Rename client actions, meta-agent tool slugs (when added), prompts, and tests. Socket API unchanged.

---

### PR 3 — Meta-agent conclude mode (museum)

**Goal:** Museum + soft cap + `canExtendMeeting` → meta-agent conclude dialogue instead of Completed overlay.

#### 3a — `reconfigureSession`

- `useRealtimeVoiceSession`: expose `reconfigureSession()` → `eventLoop.configureSession(buildSessionConfig())`.
- `useMetaAgent` / `MeetingMetaAgent`: pass through.

#### 3b — `metaAgentMode` + prompts

- `metaAgentMode: 'interruption' | 'conclude'` in Council (lifted state or callback bundle).
- `metaAgentPrompt.ts`:
  - `buildConcludeAgentPrompt()` — short; chair explains meeting length; ask wrap up vs continue; must call one tool; no generic kiosk helper tone.
  - `buildConcludeStateSnapshot({ canExtendMeeting, topic, humanName, … })`.
  - `buildConcludeActivationTurn()` — triggers first spoken turn.
- `shared/prompts/meta_agent_*_json` — conclude copy + tool descriptions (or separate `meta_agent_conclude_*.json`).

#### 3c — Tools + handlers

- `createConcludeAgentTools({ canExtendMeeting, promptBundle })` — `extend_meeting` + `conclude_meeting` only; omit extend tool when `!canExtendMeeting` (defensive; PR 0 should prevent this case).
- Handlers call Council callbacks → existing socket emits; then `silenceAgentOutput`, `setMetaAgentActive(false)`, `setMetaAgentMode('interruption')`, `reconfigureSession()` back to interruption defaults.

#### 3d — Wiring

| File | Change |
|------|--------|
| `useCouncilMachine.ts` | Museum `max_reached`: skip `completed` overlay; expose `canExtendMeeting` (already exists) |
| `Council.tsx` | `metaAgentMode`, `setMetaAgentMode`, pass conclude callbacks + `councilState` / `canExtendMeeting` |
| `MeetingMetaAgent.tsx` | Mode prop; `useEffect` on mode → `reconfigureSession` + conclude activation; conclude idle → `conclude_meeting`; disable interruption auto-resume in conclude mode |
| `Main.tsx` | Thread `metaAgentMode` if lifted |

#### 3e — Tests

- `MeetingMetaAgent.test.tsx` — conclude activation on `max_reached` + museum; tools; idle conclude; no interruption auto-resume.
- `useCouncilMachine.test.tsx` — museum does not set `completed` overlay.
- `metaAgentTools.test.ts` — conclude handlers.

---

## Flow diagram (after all PRs)

```text
Soft cap hit (canContinue: true)
  Server → pushes max_reached
  Museum client → metaAgentMode=conclude, metaAgentActive=true
                → reconfigureSession(conclude prompt + 2 tools)
                → chair speaks first
  Visitor PTT dialogue
                → extend_meeting OR conclude_meeting
  extend → trim max_reached, continue_conversation, meta agent off, council resumes
  conclude → wrap_up path (PR 1: chair line + summary)

Hard cap (canContinue: false) — PR 0
  Server → skip max_reached, wrap_up directly (PR 1: chair line + summary)
  No overlay, no agent
```

---

## Open decisions (minor — resolve during PR 3)

| # | Question | Default recommendation |
|---|----------|------------------------|
| 1 | Conclude idle timeout duration | Same as interruption remind + 10s auto-action (`BUTTON_IDLE_REMIND_MS` + 10s) |
| 2 | Exact PR 2 tool slugs | `continue_more`, `wrap_up_meeting` |
| 3 | After `extend_meeting`, reset `metaAgentMode` to `interruption` + `reconfigureSession` immediately | Yes |
| 4 | `notifyAutoplay` on conclude activate | Yes — treat as visitor activity |
| 5 | Separate JSON file for conclude prompt vs section in `meta_agent_*.json` | Section first; split if prompt grows |

---

## `autoplay-layer-a-todo` status

`Completed` overlay auto-wrap → **replaced** by this plan (PR 0 + PR 3). Web Completed overlay unchanged.
