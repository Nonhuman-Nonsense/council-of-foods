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
| **3** | Museum meta-agent `extension` phase | **In progress** (3a done) | foods-leo |

**Next up:** PR 3 on `foods-leo`. PRs 0–2 are implemented and merged to forest.

---

## Architecture decisions (locked)

### Keep `councilState`; add `metaAgentPhase` (unified)

| State | Role |
|-------|------|
| `councilState === 'query_extension'` | Playback cursor is on the `query_extension` sentinel; meeting is at soft cap. **Unchanged** — do not add a new council state. |
| `metaAgentPhase` | Single enum for meta-agent lifecycle: `'inactive'` \| `'interruption'` \| `'extension'`. Replaces the old `metaAgentActive` boolean + separate mode flag. |

**Why one enum instead of `metaAgentActive` + `metaAgentMode`:**

- `inactive` — meta-agent UI hidden, council output visible, chair zoom off. WebRTC session may still be warm (see below).
- `interruption` — visitor invoked the chair mid-meeting (PTT or future always-on mic). Tools: `resume_meeting`, `restart_meeting`.
- `extension` — soft cap reached in museum; chair handles extend vs conclude. Tools: `extend_meeting`, `conclude_meeting`.

One field answers both “is the agent UI up?” and “which job is it doing?” — easier to reason about than two booleans that can disagree during transitions.

`metaAgentActive` becomes a derived convenience: `metaAgentPhase !== 'inactive'` (remove the lifted boolean once migrated).

**Naming:** `extension` (not `conclude`) for the agent phase — coherent with `query_extension` council state and `extend_meeting` socket. Server “conclude meeting” / `conclude_meeting` remain the vocabulary for ending the meeting; the agent phase is about the **extension decision point**.

### Soft-cap fork — inside `useCouncilMachine` (no separate Council effect)

**Fork point** — `useCouncilMachine` `case 'query_extension':` (~387–395). All transition logic stays in the council state machine:

```ts
case 'query_extension':
  if (isMuseumMode) {
    setMetaAgentPhase('extension');
    // do not set overlay
  } else {
    setActiveOverlay('query_extension');
  }
  // playback cursor guards unchanged
  break;
```

Pass `isMuseumMode` and `setMetaAgentPhase` into `useCouncilMachine` from `Main` / `Council`. **No** `skipQueryExtensionOverlay` flag. **No** parallel `useEffect` in `Council.tsx` for this fork.

`notifyAutoplay` visitor-activity bump can live in the same `query_extension` branch when `isMuseumMode`.

### Museum gate — `isMuseumMode` only (not `museum + PTT`)

Soft-cap agent activation and meta-agent mounting use **`isMuseumMode`** alone:

- Today: PTT still controls mic within `interruption` / `extension` phases.
- Future: always-on mic in museum still hits the same `extension` fork at soft cap.

Update mount contract: `MeetingMetaAgent` mounts when `isMuseumMode && liveKey` (drop `pushToTalkMode` from the gate).

### `reconfigureSession` + `onSessionReady` activation

When `metaAgentPhase` changes while the WebRTC session is connected:

1. `instructions` + `tools` update via `useMemo` (phase-specific prompt bundle).
2. `reconfigureSession()` → `session.update` on the **existing** data channel (no new WebRTC handshake).
3. Provider acks with `session.updated`. The event loop already handles this; expose an **`onSessionReady`** callback that runs **after** ack.
4. `onSessionReady` runs phase-specific activation: STATE SYNC + synthetic user turn + `response.create`.

**Why `onSessionReady` instead of firing activation immediately after `reconfigureSession()`?**

`session.update` is async. Sending user items / `response.create` before the provider has applied new instructions/tools can race and leave the agent on the old prompt or tool list. Chaining activation to `session.updated` is the same pattern as the voice-guide opening greeting — one clean hook, no arbitrary delays.

**Extension activation:** chair speaks **first** without a button press (programmatic path via `onSessionReady`, separate from PTT rising-edge interruption activation).

**Interruption activation:** unchanged — PTT rising edge while `phase === 'inactive'` → `setMetaAgentPhase('interruption')` → `onSessionReady` or existing activate path.

### How fast is `reconfigureSession`?

| Factor | Expectation |
|--------|-------------|
| Transport | Existing WebRTC data channel — **no** new ICE/SDP negotiation |
| Work | One `session.update` JSON message + provider `session.updated` ack |
| Typical latency | ~**100–500 ms** on a museum LAN install; can spike on slow uplink |
| Session warmth | Meta-agent WebRTC connects when `isMuseumMode && liveKey` (component mounted for the whole live meeting), so at `query_extension` the channel is usually **already open** |

**Can we reconfigure directly when we react to `query_extension`?** Yes — that is the right moment. In `useCouncilMachine`, `setMetaAgentPhase('extension')` triggers `MeetingMetaAgent` to call `reconfigureSession()`; chair speech starts after `session.updated` (~sub-second). Visitors see council output hide immediately (phase ≠ inactive); a brief beat before the chair speaks is acceptable and matches “connection thinking” UX. No need to pre-configure extension tools earlier.

If latency proves noticeable in install testing, optional optimisation: keep interruption config until soft cap (today’s behaviour) and only pay reconfigure cost once — still triggered at `query_extension`.

### Extension-phase tools (agent must call exactly one)

| Tool | Client handler | Socket emit |
|------|----------------|-------------|
| `extend_meeting` | `handleOnExtendMeeting` | `extend_meeting` |
| `conclude_meeting` | `handleOnConcludeMeeting` | `conclude_meeting` |

Extension phase exposes **only these two** tools (no `resume_meeting`, no `restart_meeting`). Interruption phase keeps `resume_meeting` + `restart_meeting`.

Terminal tool handlers (`extend_meeting`, `conclude_meeting`, `resume_meeting`, `restart_meeting`) all set `metaAgentPhase` → `'inactive'` and call `reconfigureSession()` back to interruption defaults (ready for the next PTT press).

Hard cap auto-conclude (PR 0) means the extension agent is never needed for the absolute limit case.

### Idle timeout (extension phase only)

Mirror interruption idle remind pattern (`MeetingMetaAgent` ~10s after `BUTTON_IDLE_REMIND_MS`), but:

- **Do not** auto-call `resume_meeting`.
- If visitor never engages after remind → auto-call **`conclude_meeting`** handler (same as conclude button on web).

Disable interruption auto-resume while `metaAgentPhase === 'extension'`.

### Layer B / autoplay

Bump autoplay activity when extension agent activates (`notifyAutoplay` in the museum `query_extension` branch).

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

### PR 3 — Meta-agent extension phase (museum)

Split into sub-PRs:

| Sub-PR | Scope | Status |
|--------|-------|--------|
| **3a** | `reconfigureSession` + `onSessionReady`; `metaAgentPhase` in `Council`; mount on `isMuseumMode` | **Done** (foods-leo) |
| **3b** | Extension prompts, tools, `MeetingMetaAgent` phase switching | Next |
| **3c** | Museum fork in `useCouncilMachine` at `query_extension` | After 3b |

**Goal:** Museum + soft cap → meta-agent **extension** dialogue instead of `QueryExtension` overlay.

**Prerequisites (done):** PR 0–2 — server `handleConcludeMeeting` / `handleExtendMeeting`, client handlers, `resume_meeting` interruption tools, chair closing + summarize split.

**Current code gaps (foods-leo, after 3a):**

- `useCouncilMachine` still sets `query_extension` overlay for all clients — museum fork in **3c**.
- `MeetingMetaAgent` is interruption-only — extension prompts/tools in **3b**.

#### 3a — `reconfigureSession` + `onSessionReady`

- `realtimeEventLoop`: expose `onSessionReady` callback invocation on `session.updated` (already partially there via `callbacks.onSessionReady`).
- `useRealtimeVoiceSession`: expose `reconfigureSession()` + register phase activation on `onSessionReady`.
- `useMetaAgent` / `MeetingMetaAgent`: pass through.

#### 3b — `metaAgentPhase` + prompts

- `metaAgentPhase: 'inactive' | 'interruption' | 'extension'` in **`Council.tsx`** (resets on unmount). Pass `setMetaAgentPhase` into `useCouncilMachine` (3c) and `MeetingMetaAgent`.
- Forest merge: drop `metaAgentActive` from `Main` / `Forest` — zoom uses `currentSpeakerId` only (`""` or chair id during meta-agent).
- `metaAgentPrompt.ts`:
  - `buildExtensionAgentPrompt()` — short; chair explains meeting length; ask extend vs conclude; must call one tool.
  - `buildExtensionStateSnapshot()` — STATE SYNC with `type: "meta_agent_extension"`, `councilState: "query_extension"`.
  - `buildExtensionActivationTurn()` — synthetic user turn for first spoken line (chair, no PTT).
- `shared/prompts/meta_agent_*_json` — `extensionJobInstructions`, `extensionToolDescriptions` sections (foods en first).

#### 3c — Tools + handlers

- `createExtensionAgentTools({ promptBundle })` — `extend_meeting` + `conclude_meeting` only.
- Handlers call Council callbacks → existing `handleOnExtendMeeting` / `handleOnConcludeMeeting`; then `silenceAgentOutput`, `setMetaAgentPhase('inactive')`, `reconfigureSession()` (interruption defaults for next PTT).

#### 3d — Wiring

| File | Change |
|------|--------|
| `useCouncilMachine.ts` | Accept `isMuseumMode`, `setMetaAgentPhase`. In `case 'query_extension'`: museum → `setMetaAgentPhase('extension')`; else → overlay. |
| `Council.tsx` | Owns `metaAgentPhase` state; pass to scene + meta-agent. |
| `MeetingMetaAgent.tsx` | Phase prop; `useEffect` on phase → `reconfigureSession`; `onSessionReady` → phase activation; extension idle → `conclude_meeting`; block interruption PTT path when `phase === 'extension'`. |

#### 3e — Phase transition summary

| Event | `metaAgentPhase` |
|-------|------------------|
| PTT press while `inactive` | → `interruption` |
| `query_extension` + museum | → `extension` |
| `query_extension` + web | stays `inactive` (overlay instead) |
| `resume_meeting` / terminal tools | → `inactive` |
| Leave meeting route | → `inactive` |
| Soft cap while already `interruption` | → `extension` (+ `reconfigureSession`) |

#### 3f — Tests

- `MeetingMetaAgent.test.tsx` — extension activation via `onSessionReady`; tools; idle → `conclude_meeting`; no `resume_meeting` in extension phase.
- `useCouncilMachine.test.tsx` — museum sets `extension` phase, no overlay; web sets overlay, phase stays `inactive`.
- `metaAgentTools.test.ts` — extension tool handlers.

#### Suggested PR 3 implementation order

1. `reconfigureSession` + `onSessionReady` plumbing + unit tests.
2. `metaAgentPhase` state (replace `metaAgentActive`) + extension prompt bundle.
3. `createExtensionAgentTools` + handlers wired to existing socket callbacks.
4. Museum fork in `useCouncilMachine` `query_extension` case.
5. `MeetingMetaAgent` phase switching + extension activation + idle timeout.
6. Merge to forest with sv extension copy in `meta_agent_beings_*.json`.

---

## Flow diagram (after all PRs)

```text
Soft cap hit
  Server → pushes query_extension
  Web client → QueryExtension overlay (extend / conclude buttons)
  Museum client → useCouncilMachine: setMetaAgentPhase('extension')
                → reconfigureSession (extension prompt + 2 tools)
                → onSessionReady → chair speaks first (no PTT)
  Visitor dialogue (PTT today; always-on mic future)
                → extend_meeting OR conclude_meeting
  extend → trim query_extension, extend_meeting socket, phase → inactive, council resumes
  conclude → handleOnConcludeMeeting (PR 1: chair closing line + summary)

Hard cap — PR 0
  Server → skip query_extension, handleConcludeMeeting directly (PR 1: closing + summary)
  No overlay, no agent
```

---

## Open decisions (resolve during PR 3)

| # | Question | Decision | Status |
|---|----------|----------|--------|
| 1 | Extension idle timeout duration | Same as interruption remind + 10s auto-action (`BUTTON_IDLE_REMIND_MS` + 10s) | **Default** |
| 2 | Extension-phase tool slugs | `extend_meeting`, `conclude_meeting` | **Resolved** (PR 2) |
| 3 | Interruption resume tool slug | `resume_meeting` | **Resolved** (PR 2) |
| 4 | Agent phase enum | `'inactive' \| 'interruption' \| 'extension'` (replaces `metaAgentActive` + mode) | **Resolved** |
| 5 | Agent phase name at soft cap | `extension` (aligned with `query_extension`) | **Resolved** |
| 6 | Museum gate | `isMuseumMode` only (not `museum + PTT`) | **Resolved** |
| 7 | Soft-cap fork location | `useCouncilMachine` `query_extension` case (no Council `useEffect`) | **Resolved** |
| 8 | Activation timing | `onSessionReady` after `reconfigureSession` | **Resolved** |
| 9 | After `extend_meeting`, reset phase to `inactive` + `reconfigureSession` | Yes | **Resolved** |
| 10 | `notifyAutoplay` on extension activate | Yes — in museum `query_extension` branch | **Resolved** |
| 11 | Extension prompt JSON | Section in `meta_agent_*.json` first | **Default** |

---

## `autoplay-layer-a-todo` status

`QueryExtension` overlay 45s auto-conclude → **replaced** by this plan (PR 0 hard cap + PR 3 museum agent). Web `QueryExtension` overlay unchanged for soft cap.
