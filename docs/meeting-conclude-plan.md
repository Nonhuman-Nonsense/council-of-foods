# Meeting conclude flow — implementation plan

Museum installs should not use the `QueryExtension` overlay for conclude vs extend. When the soft cap is hit, the **meta-agent** (chair voice) asks the visitor; the agent calls one of two tools. When extension is not allowed (hard cap), the server skips the choice entirely.

**Branch:** `foods-leo` first; merged to `forest-leo` (2026-06).

**Related:** [autoplay-layer-a-todo.md](./autoplay-layer-a-todo.md) (Layer A), [meta-agent-realtime-ux-plan.md](./meta-agent-realtime-ux-plan.md).

---

## Status overview

| PR | Goal | Status | Branch |
|----|------|--------|--------|
| **0** | Hard cap auto-conclude (`CONCLUDE_MEETING`) | **Done** | foods-leo → forest-leo |
| **1** | Chair closing line before summary | **Done** | foods-leo → forest-leo |
| **2** | Rename extend / conclude / summarize vocabulary | **Done** | foods-leo → forest-leo |
| **3** | Museum meta-agent `conclude` mode | **Next** | foods-leo |

**Next up:** PR 3 on `foods-leo`. PRs 0–2 are implemented and merged to forest.

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
| Web (not museum) | `setActiveOverlay('query_extension')` — `QueryExtension` overlay (unchanged) |
| Museum + live soft cap | Do **not** set `query_extension` overlay; Council sets `metaAgentMode = 'conclude'` + `metaAgentActive = true` |

Do **not** infer conclude mode from `query_extension && metaAgentActive` alone — explicit `metaAgentMode` keeps interruption vs conclude separate and extensible.

### `reconfigureSession` on mode change

When `metaAgentMode` changes while the WebRTC session is connected:

1. `instructions` + `tools` update via `useMemo` (mode-specific prompt bundle).
2. `useEffect([metaAgentMode])` → `reconfigureSession()` (`session.update` on the existing data channel).
3. On `session.updated` (event loop already handles this), run mode-specific activation (STATE SYNC + synthetic user turn + `response.create`).

**Conclude activation:** chair speaks **first** without a button press (programmatic path, separate from PTT rising-edge interruption activation).

### Conclude-mode tools (agent must call exactly one)

| Tool | Client handler | Socket emit |
|------|----------------|-------------|
| `extend_meeting` | `handleOnExtendMeeting` | `extend_meeting` |
| `conclude_meeting` | `handleOnConcludeMeeting` | `conclude_meeting` |

Conclude mode exposes **only these two** tools (no `resume_meeting`, no `restart_meeting`). Interruption mode keeps `resume_meeting` + `restart_meeting` (renamed from `continue_meeting` in PR 2).

Hard cap auto-conclude (PR 0) means the conclude agent is never needed for the absolute limit case.

### Idle timeout (conclude mode only)

Mirror interruption idle remind pattern (`MeetingMetaAgent` ~10s after `BUTTON_IDLE_REMIND_MS`), but:

- **Do not** auto-call `resume_meeting`.
- If visitor never engages after remind → auto-call **`conclude_meeting`** handler (same as conclude button on web).

Disable interruption auto-resume while `metaAgentMode === 'conclude'`.

### Layer B / autoplay

Bump autoplay activity when conclude agent activates so conclude dialogue does not trigger idle replay. (Detail in implementation.)

---

## Forest merge notes (foods-leo → forest-leo)

After PRs 0–2 landed on `foods-leo`, changes were merged to `forest-leo`. Install-specific follow-ups applied on forest:

| Area | Foods | Forest |
|------|-------|--------|
| `concludeMeetingPrompt` | en only | en + sv (chair closing line) |
| `summarizeMeetingPrompt` | en — EU Commission wording | en + sv — Swedish government wording (preserved from old `finalizeMeetingPrompt`) |
| `translation_*.json` | `queryExtension` (en) | `queryExtension` (en + sv); removed stale `completed` block |
| Meta-agent interruption | `meta_agent_foods_en.json` — `resume_meeting` | `meta_agent_beings_en.json` + `meta_agent_beings_sv.json` — same rename |
| Forest-only test | — | `MeetingLifecycleHandlerPrompts.forest.test.ts` — two-step conclude (closing + summarize), Swedish prompts |
| Prototype | `extendMeeting`, `extend_meeting` emit | same (merged) |

**Foods does not need forest’s sv prompts** unless we add Swedish to the foods install later.

**Known follow-up (not blocking PR 3):** `conversation_end` socket event still fires at soft cap; name is misleading now that hard cap skips it. Consider renaming in a separate PR.

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
| `CONCLUDE_MEETING` (at `meetingVeryMaxLength`) | Do **not** push `query_extension`; call `handleConcludeMeeting` directly; do **not** emit `conversation_end` |

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
    | "CONCLUDE_MEETING";  // hard cap — auto conclude, no choice
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
| `CONCLUDE_MEETING` | Server date → `handleConcludeMeeting({ date })`, no `query_extension`, no `conversation_end`, loop stops |

#### Server changes

**1. `MeetingManager.decideNextAction` + `Decision` type** — split as above.

**2. `MeetingManager.processTurn`** — two cases instead of one branched `END_CONVERSATION`.

**3. `MeetingLifecycleHandler.handleConcludeMeeting`** — relax `query_extension` requirement (see below).


Today it **throws** if no `query_extension` sentinel (lines 61–64). Change to:

```text
mr = findIndex query_extension
if (mr !== -1) {
  conversation = slice(0, mr)   // manual / soft-cap path (client clicked wrap up)
} else {
  // hard-cap auto path: conversation already ends on last real turn
  log optional: "conclude without query_extension sentinel (hard cap)"
}
// then chair closing (PR 1) + summary (summarizeMeetingPrompt, chairInterjection, push summary, TTS)
```

Socket-initiated `conclude_meeting` from the `QueryExtension` overlay still works: client trims locally, emits `conclude_meeting`; server finds `query_extension` if present, strips it, runs closing + summary.

**3. No new socket events or GlobalOptions** for PR 0 (PR 1 adds chair closing line later).

**4. No client changes required** — hard cap never sends `query_extension`. Playback advances until `summary` appears in `conversation_update`; existing `councilState → summary` logic applies.

#### What we deliberately do not do in PR 0

- Meta-agent / `reconfigureSession` / `metaAgentMode`
- Chair closing statement before summary (PR 1)
- Tool renames (PR 2)
- Change soft-cap behaviour (still gets `query_extension` sentinel)

#### Logging

Add clear server logs to distinguish paths:

- `[meeting N] conversation soft cap reached, awaiting visitor choice` (query_extension pushed)
- `[meeting N] hard cap reached, auto conclude` (summary generation started)

#### Tests to update / add

| File | Change |
|------|--------|
| `ConversationFlow.test.js` | Hard cap: after `runLoop()`, conversation ends with **`summary`**, no `query_extension`; `broadcastConversationEnd` **not** called |
| `ConversationFlow.test.js` | Soft cap: still ends with `query_extension` |
| `MeetingLifecycleHandler.test.js` | Conclude without `query_extension` sentinel succeeds (hard-cap path) |
| `MeetingLifecycleHandler.test.js` | Strip-`query_extension` test for soft-cap manual conclude |
| `DecisionLogic.test.js` | Soft-cap scenarios expect `QUERY_EXTENSION`; hard-cap expects `CONCLUDE_MEETING` (replace `END_CONVERSATION`) |

Mock `dialogGenerator.chairInterjection` in the hard-cap integration test (same as existing wrap-up tests).

#### Manual test plan

1. Set low `conversationMaxLength` and `meetingVeryMaxLength` equal (e.g. 5) in prototype or test env.
2. Run meeting to cap → server should generate summary **without** `QueryExtension` overlay / `query_extension` in conversation.
3. Soft cap (`meetingVeryMaxLength` > `conversationMaxLength`) → still get `query_extension` with extend option (web overlay / future museum agent).

#### Risk notes

- **Date in summary prompt:** auto path uses server UTC date; manual path uses client browser date. Acceptable for PR 0; document if installs care about local date.
- **Wrap-up duration:** closing + summary generation runs inside `processTurn` while loop is already marked inactive — same as socket `conclude_meeting`; no `startLoop` after.
- **Reconnection:** if client reconnects mid-summary-generation, existing reconnection + conversation replay should show partial conversation then summary when broadcast arrives.

**No meta-agent changes.**

---

### PR 1 — Chair closing statement before summary

**Status:** Implemented.

**Goal:** When conclude/wrap-up runs, chair speaks one final in-character line **before** the summary message (orthogonal to agent).

**Server:**

- New prompt in `server/global-options.json` (e.g. `concludeMeetingPrompt` + `concludeMeetingLength`), distinct from `summarizeMeetingPrompt`.
- `handleConcludeMeeting`: after stripping `query_extension`, generate chair **closing statement** (`type: 'message'` or dedicated type if needed), push + TTS, **then** generate summary as today.

**Client:** Playback flows through closing statement → summary (existing state machine).

**Tests:** lifecycle handler — conversation shape `[…, closing, summary]`; audio queued for both.

**Implement before PR 3** so agent-triggered conclude uses the same path.

---

### PR 2 — Rename extend / conclude / summarize vocabulary

**Status:** Implemented (foods-leo; merged to forest-leo).

**Goal:** Clearer names for humans, socket protocol, and the PR 3 conclude agent.

#### Naming standard (locked)

| Concept | Socket | Server | Client | Config |
|---------|--------|--------|--------|--------|
| **Extend meeting** | `extend_meeting` | `handleExtendMeeting` | `handleOnExtendMeeting` | — |
| **Conclude meeting** | `conclude_meeting` | `handleConcludeMeeting` | `handleOnConcludeMeeting` | `concludeMeetingPrompt` / `concludeMeetingLength` |
| **Summarize meeting** | (internal) | `summarizeMeeting()` private | — | `summarizeMeetingPrompt` / `summarizeMeetingLength` |

#### Removed / renamed

| Old | New |
|-----|-----|
| `wrap_up_meeting` socket | `conclude_meeting` |
| `handleWrapUpMeeting` | `handleConcludeMeeting` |
| `handleOnGenerateSummary` | `handleOnConcludeMeeting` |
| `handleOnContinueMeetingLonger` | `handleOnExtendMeeting` |
| `finalizeMeetingPrompt` | `summarizeMeetingPrompt` (+ separate `concludeMeetingPrompt` from PR 1) |
| `continue_meeting` meta-agent tool | `resume_meeting` (interruption only — not extend) |
| `Completed` overlay / `completed` i18n | `QueryExtension` / `queryExtension` |
| `canContinue` on sentinel | removed — hard cap uses `CONCLUDE_MEETING` server-side |
| `max_reached` message type | `query_extension` |

#### Tests updated

Server lifecycle tests, `SocketTypes`, client machine tests, meta-agent tool tests, prototype socket events.

---

### PR 3 — Meta-agent conclude mode (museum) — **NEXT**

**Status:** Not started.

**Goal:** Museum + soft cap → meta-agent conclude dialogue instead of `QueryExtension` overlay.

**Prerequisites (done):** PR 0–2 — server `handleConcludeMeeting` / `handleExtendMeeting`, client handlers, `resume_meeting` interruption tools, chair closing + summarize split.

**Current code gaps (foods-leo):**

- `useCouncilMachine` still sets `query_extension` overlay for **all** clients (no museum fork).
- `metaAgentMode` does not exist; `MeetingMetaAgent` is interruption-only (`resume_meeting` + `restart_meeting`).
- `realtimeEventLoop.configureSession` exists but is **not** exposed via `useRealtimeVoiceSession` / `useMetaAgent` as `reconfigureSession` for mid-session mode switches.

#### 3a — `reconfigureSession`

- `useRealtimeVoiceSession`: expose `reconfigureSession()` → `eventLoop.configureSession(buildSessionConfig(), { triggerGreetingOnReady: false })`.
- `useMetaAgent` / `MeetingMetaAgent`: pass through.

#### 3b — `metaAgentMode` + prompts

- `metaAgentMode: 'interruption' | 'conclude'` in Council (lifted state or callback bundle).
- `metaAgentPrompt.ts`:
  - `buildConcludeAgentPrompt()` — short; chair explains meeting length; ask conclude vs extend; must call one tool; no generic kiosk helper tone.
  - `buildConcludeStateSnapshot({ topic, humanName, … })`.
  - `buildConcludeActivationTurn()` — triggers first spoken turn (chair speaks **without** PTT press).
- `shared/prompts/meta_agent_*_json` — conclude copy + `extend_meeting` / `conclude_meeting` tool descriptions (section in existing bundle, or `meta_agent_conclude_*.json` if it grows).

#### 3c — Tools + handlers

- `createConcludeAgentTools({ promptBundle })` — `extend_meeting` + `conclude_meeting` only.
- Handlers call Council callbacks → existing `handleOnExtendMeeting` / `handleOnConcludeMeeting` socket emits; then `silenceAgentOutput`, `setMetaAgentActive(false)`, `setMetaAgentMode('interruption')`, `reconfigureSession()` back to interruption defaults.

#### 3d — Wiring

| File | Change |
|------|--------|
| `useCouncilMachine.ts` | Museum `query_extension`: skip overlay; signal Council to activate conclude meta-agent |
| `Council.tsx` | `metaAgentMode`, `setMetaAgentMode`, pass conclude callbacks + `councilState` |
| `MeetingMetaAgent.tsx` | Mode prop; `useEffect` on mode → `reconfigureSession` + conclude activation; conclude idle → `conclude_meeting`; disable interruption auto-resume in conclude mode |
| `Main.tsx` | Thread `metaAgentMode` if lifted |

#### 3e — Tests

- `MeetingMetaAgent.test.tsx` — conclude activation on `query_extension` + museum; tools; idle conclude; no interruption auto-resume.
- `useCouncilMachine.test.tsx` — museum does not set `query_extension` overlay.
- `metaAgentTools.test.ts` — conclude tool handlers.

#### Suggested PR 3 implementation order

1. Expose `reconfigureSession` + unit test on event loop / session hook.
2. Add `metaAgentMode` state + conclude prompt bundle (foods en first).
3. `createConcludeAgentTools` + handlers wired to existing socket callbacks.
4. Museum fork in `useCouncilMachine` + Council wiring.
5. Conclude activation + idle timeout → auto `conclude_meeting`.
6. Merge to forest with sv conclude prompt copy if needed.

---

## Flow diagram (after all PRs)

```text
Soft cap hit
  Server → pushes query_extension
  Web client → QueryExtension overlay (extend / conclude buttons)
  Museum client → metaAgentMode=conclude, metaAgentActive=true
                → reconfigureSession(conclude prompt + 2 tools)
                → chair speaks first (no PTT)
  Visitor PTT dialogue
                → extend_meeting OR conclude_meeting
  extend → trim query_extension, extend_meeting socket, meta agent off, council resumes
  conclude → handleConcludeMeeting (PR 1: chair closing line + summary)

Hard cap — PR 0
  Server → skip query_extension, handleConcludeMeeting directly (PR 1: closing + summary)
  No overlay, no agent
```

---

## Open decisions (resolve during PR 3)

| # | Question | Default recommendation | Status |
|---|----------|------------------------|--------|
| 1 | Conclude idle timeout duration | Same as interruption remind + 10s auto-action (`BUTTON_IDLE_REMIND_MS` + 10s) | Open |
| 2 | Conclude-mode tool slugs | `extend_meeting`, `conclude_meeting` | **Resolved** (PR 2) |
| 3 | Interruption resume tool slug | `resume_meeting` (not `continue_meeting`) | **Resolved** (PR 2) |
| 4 | After `extend_meeting`, reset `metaAgentMode` to `interruption` + `reconfigureSession` immediately | Yes | Open |
| 5 | `notifyAutoplay` on conclude activate | Yes — treat as visitor activity | Open |
| 6 | Separate JSON file for conclude prompt vs section in `meta_agent_*.json` | Section first; split if prompt grows | Open |

---

## `autoplay-layer-a-todo` status

`QueryExtension` overlay 45s auto-conclude → **replaced** by this plan (PR 0 hard cap + PR 3 museum agent). Web `QueryExtension` overlay unchanged for soft cap.
