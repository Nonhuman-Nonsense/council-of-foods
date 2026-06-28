# Meeting conclude flow — implementation plan

Museum installs should not use the `QueryExtension` overlay for wrap-up vs extend. When the soft cap is hit, the **meta-agent** (chair voice) asks the visitor; the agent calls one of two tools. When extension is not allowed (hard cap), the server skips the choice entirely.

**Branch:** `foods-leo` first.

**Related:** [autoplay-layer-a-todo.md](./autoplay-layer-a-todo.md) (Layer A), [meta-agent-realtime-ux-plan.md](./meta-agent-realtime-ux-plan.md).

---

## Architecture decisions (locked)

### Keep `councilState`; add `metaAgentMode`

| State | Role |
|-------|------|
| `councilState === 'query_extension'` | Playback cursor is on the `query_extension` sentinel; meeting is at soft cap. **Unchanged** — do not add a new council state. |
| `metaAgentMode` | Orthogonal meta-agent job: `'interruption'` (default) \| `'conclude'`. Lives next to `metaAgentActive` (Council / `MeetingMetaAgent`). |
| `metaAgentActive` | UI + WebRTC session visible; meeting output hidden; chair zoom. Same as today. |

**Fork point** — `useCouncilMachine` `case 'query_extension':` (~387–395):

| Condition | Action |
|-----------|--------|
| Web (not museum) | `setActiveOverlay('completed')` — unchanged |
| Museum + live soft cap | Do **not** set `query_extension` overlay; Council sets `metaAgentMode = 'conclude'` + `metaAgentActive = true` |

Do **not** infer conclude mode from `query_extension && metaAgentActive` alone — explicit `metaAgentMode` keeps interruption vs conclude separate and extensible.

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

Hard cap auto-conclude (PR 0) means the conclude agent is never needed for the absolute limit case.

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

**Status:** Implemented.

**Goal:** When the meeting hits the **hard cap** (no room to extend), skip `query_extension` entirely and go straight to wrap-up (summary generation). No Completed overlay, no museum agent, no client choice.

**Branch:** `foods-leo`.

#### When does this fire?

In `decideNextAction()` the loop already returns `END_CONVERSATION` when:

```text
conversation.length >= conversationMaxLength + conversationExtraSlots
   OR
conversation.length >= meetingVeryMaxLength
```

PR 0 splits that branch via `QUERY_EXTENSION` vs `CONCLUDE_MEETING`:

| Decision | Server behaviour |
|----------|----------------|
| `QUERY_EXTENSION` (soft cap, room to extend) | Push `{ type: 'query_extension' }`, persist, `broadcastConversationUpdate` + `broadcastConversationEnd`, loop stops |
| `CONCLUDE_MEETING` (at `meetingVeryMaxLength`) | Do **not** push `query_extension`; call wrap-up directly; do **not** emit `conversation_end` |

`hasRoomToExtend = currentCap < meetingVeryMaxLength` where `currentCap = conversationMaxLength + conversationExtraSlots`.

#### Decision type split (recommended)

Instead of branching inside `processTurn(END_CONVERSATION)`, split at **`decideNextAction()`** so cap handling is explicit in the decision enum:

```ts
interface Decision {
  type:
    | "IDLE"
    | "GENERATE_AI_RESPONSE"
    | "REQUEST_PANELIST"
    | "QUERY_EXTENSION"    // soft cap — visitor may extend or conclude
    | "CONCLUDE_MEETING";  // hard cap — auto wrap-up, no choice
}
```

**`decideNextAction()`** (replace single `END_CONVERSATION` return):

```ts
if (conversation.length >= veryMax || conversation.length >= currentCap) {
  const hasRoomToExtend = currentCap < meetingVeryMaxLength;
  return { type: hasRoomToExtend ? "QUERY_EXTENSION" : "CONCLUDE_MEETING" };
}
```

**`processTurn()`:**

| Decision | Behaviour |
|----------|-----------|
| `QUERY_EXTENSION` | Push `{ type: 'query_extension' }`, persist, `broadcastConversationUpdate`, `broadcastConversationEnd`, loop stops |
| `CONCLUDE_MEETING` | Server date → `handleWrapUpMeeting({ date })`, no `query_extension`, no `conversation_end`, loop stops |

**`runLoop()`:** treat `QUERY_EXTENSION` and `CONCLUDE_MEETING` like today's `END_CONVERSATION` (set `isLoopActive = false` before/after `processTurn`, then return).

**Naming:** `QUERY_EXTENSION` reads well next to future museum conclude-agent; `CONCLUDE_MEETING` is unambiguous for hard-cap auto summary. Drop `END_CONVERSATION` (no callers outside tests).

#### Server changes

**1. `MeetingManager.decideNextAction` + `Decision` type** — split as above.

**2. `MeetingManager.processTurn`** — two cases instead of one branched `END_CONVERSATION`.

**3. `MeetingLifecycleHandler.handleWrapUpMeeting`** — relax `query_extension` requirement (see below).


Today it **throws** if no `query_extension` sentinel (lines 61–64). Change to:

```text
mr = findIndex query_extension
if (mr !== -1) {
  conversation = slice(0, mr)   // manual / soft-cap path (client clicked wrap up)
} else {
  // hard-cap auto path: conversation already ends on last real turn
  log optional: "wrap up without query_extension sentinel (hard cap)"
}
// then existing summary generation (finalizeMeetingPrompt, chairInterjection, push summary, TTS)
```

Socket-initiated `wrap_up_meeting` from the Completed overlay still works: client trims locally, emits wrap-up; server still finds `query_extension` if present, strips it, appends summary.

**3. No new socket events or GlobalOptions** for PR 0 (PR 1 adds chair closing line later).

**4. No client changes required** — client never receives `query_extension` with `canContinue: false`. Playback advances until `summary` appears in `conversation_update`; existing `councilState → summary` logic applies.

Optional belt-and-suspenders (not required for PR 0): museum client auto-`handleOnGenerateSummary` if an old server still sends `query_extension` + `canContinue: false`.

#### What we deliberately do not do in PR 0

- Meta-agent / `reconfigureSession` / `metaAgentMode`
- Chair closing statement before summary (PR 1)
- Tool renames (PR 2)
- Change soft-cap behaviour (`canContinue: true` still gets `query_extension`)

#### Logging

Add clear server logs to distinguish paths:

- `[meeting N] conversation soft cap reached, awaiting visitor choice` (query_extension pushed)
- `[meeting N] hard cap reached, auto wrap up` (summary generation started)

#### Tests to update / add

| File | Change |
|------|--------|
| `ConversationFlow.test.js` | **`sets canContinue false on query_extension when at meetingVeryMaxLength`** → rewrite: after `runLoop()`, conversation ends with **`summary`**, no `query_extension`; `broadcastConversationEnd` **not** called; `chairInterjection` / summary path invoked |
| `ConversationFlow.test.js` | Keep soft-cap test: still ends with `query_extension`, `canContinue: true` |
| `MeetingLifecycleHandler.test.js` | **`throws when wrap-up without query_extension`** → change to **succeeds**: conversation `[message]` → `[message, summary]` |
| `MeetingLifecycleHandler.test.js` | Keep strip-`query_extension` test for soft-cap manual wrap-up |
| `DecisionLogic.test.js` | Soft-cap scenarios expect `QUERY_EXTENSION`; hard-cap expects `CONCLUDE_MEETING` (replace `END_CONVERSATION`) |

Mock `dialogGenerator.chairInterjection` in the hard-cap integration test (same as existing wrap-up tests).

#### Manual test plan

1. Set low `conversationMaxLength` and `meetingVeryMaxLength` equal (e.g. 5) in prototype or test env.
2. Run meeting to cap → server should generate summary **without** Completed overlay / `query_extension` in conversation.
3. Soft cap (`meetingVeryMaxLength` > `conversationMaxLength`) → still get `query_extension` with extend option (web overlay / future museum agent).

#### Risk notes

- **Date in summary prompt:** auto path uses server UTC date; manual path uses client browser date. Acceptable for PR 0; document if installs care about local date.
- **Wrap-up duration:** summary generation runs inside `processTurn` while loop is already marked inactive — same as socket `wrap_up_meeting`; no `startLoop` after.
- **Reconnection:** if client reconnects mid-summary-generation, existing reconnection + conversation replay should show partial conversation then summary when broadcast arrives.

**No meta-agent changes.**

---

### PR 1 — Chair closing statement before summary

**Status:** Implemented.

**Goal:** When conclude/wrap-up runs, chair speaks one final in-character line **before** the summary message (orthogonal to agent).

**Server:**

- New prompt in `server/global-options.json` (e.g. `concludeMeetingPrompt` + `concludeMeetingLength`), distinct from `finalizeMeetingPrompt`.
- `handleWrapUpMeeting`: after stripping `query_extension`, generate chair **closing statement** (`type: 'message'` or dedicated type if needed), push + TTS, **then** generate summary as today.

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

**Goal:** Museum + soft cap → meta-agent conclude dialogue instead of `QueryExtension` overlay.

#### 3a — `reconfigureSession`

- `useRealtimeVoiceSession`: expose `reconfigureSession()` → `eventLoop.configureSession(buildSessionConfig())`.
- `useMetaAgent` / `MeetingMetaAgent`: pass through.

#### 3b — `metaAgentMode` + prompts

- `metaAgentMode: 'interruption' | 'conclude'` in Council (lifted state or callback bundle).
- `metaAgentPrompt.ts`:
  - `buildConcludeAgentPrompt()` — short; chair explains meeting length; ask wrap up vs continue; must call one tool; no generic kiosk helper tone.
  - `buildConcludeStateSnapshot({ topic, humanName, … })`.
  - `buildConcludeActivationTurn()` — triggers first spoken turn.
- `shared/prompts/meta_agent_*_json` — conclude copy + tool descriptions (or separate `meta_agent_conclude_*.json`).

#### 3c — Tools + handlers

- `createConcludeAgentTools({ promptBundle })` — `extend_meeting` + `conclude_meeting` (soft cap always offers both).
- Handlers call Council callbacks → existing socket emits; then `silenceAgentOutput`, `setMetaAgentActive(false)`, `setMetaAgentMode('interruption')`, `reconfigureSession()` back to interruption defaults.

#### 3d — Wiring

| File | Change |
|------|--------|
| `useCouncilMachine.ts` | Museum `query_extension`: skip `query_extension` overlay; activate conclude meta-agent |
| `Council.tsx` | `metaAgentMode`, `setMetaAgentMode`, pass conclude callbacks + `councilState` |
| `MeetingMetaAgent.tsx` | Mode prop; `useEffect` on mode → `reconfigureSession` + conclude activation; conclude idle → `conclude_meeting`; disable interruption auto-resume in conclude mode |
| `Main.tsx` | Thread `metaAgentMode` if lifted |

#### 3e — Tests

- `MeetingMetaAgent.test.tsx` — conclude activation on `query_extension` + museum; tools; idle conclude; no interruption auto-resume.
- `useCouncilMachine.test.tsx` — museum does not set `completed` overlay.
- `metaAgentTools.test.ts` — conclude handlers.

---

## Flow diagram (after all PRs)

```text
Soft cap hit (canContinue: true)
  Server → pushes query_extension
  Museum client → metaAgentMode=conclude, metaAgentActive=true
                → reconfigureSession(conclude prompt + 2 tools)
                → chair speaks first
  Visitor PTT dialogue
                → extend_meeting OR conclude_meeting
  extend → trim query_extension, continue_conversation, meta agent off, council resumes
  conclude → wrap_up path (PR 1: chair line + summary)

Hard cap (canContinue: false) — PR 0
  Server → skip query_extension, wrap_up directly (PR 1: chair line + summary)
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
