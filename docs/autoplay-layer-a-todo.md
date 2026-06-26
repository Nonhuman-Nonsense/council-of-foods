# Autoplay Layer A — auto-forward TODO

Layer A keeps a **live** meeting flowing when the visitor walks away mid-interaction. These are **not** part of the Layer B autoplay PR. Implement here when museum installs need them.

Layer B ([`autoplay-plan.md`](./autoplay-plan.md)) handles leaving interactive mode entirely and looping replays.

---

## Principles

- Do **not** trigger autoplay from these cases — only unstick the current live meeting.
- Prefer existing actions (`handleOnSubmitHumanMessage`, `handleOnGenerateSummary`, `handleHumanNameEntered`) over new server APIs where possible — **exception:** human abandonment uses `skip_human_turn` (see below).
- Museum-only gates (`isMuseumMode`) unless noted otherwise.
- Timings can be hardcoded next to the component that owns the behaviour (no `global-options` unless we later want install tuning).

---

## TODO items

### Human input / panelist abandonment

**Status:** Implemented.

**When:** `HumanInput` is mounted with `phase === "active"` (council in `human_input` or `human_panelist`), museum + PTT mode, visitor never completes a turn within **60s** of abandoned idle (see timer rules below).

**Desired behaviour:** Skip the visitor's turn and resume live council playback. **Does not** enter Layer B autoplay.

---

#### Server: `skip_human_turn`

New socket event (no payload, or optional `{ reason: "idle" }` for logs).

**Handler** (`HumanInputHandler.handleSkipHumanTurn`, wired via `MeetingManager` → `SocketManager`):

1. Validate last conversation message is `awaiting_human_question` or `awaiting_human_panelist`. If not → `reportAndCrashClient` (same strictness as submit handlers).
2. Pop `awaiting_*`.
3. Pop preceding `invitation` if present (mirror submit).
4. Push `skipped` marker:
   - `type: "skipped"`
   - `speaker`: human name (question path) or panelist id (panelist path)
   - `text: ""`, generated `id` as needed
5. Clear **`handRaised`** (server) for both paths.
6. Persist, `broadcastConversationUpdate`, `startLoop()` (no human/panelist TTS).

**Replay:** `skipped` is not special-cased in replay UX — playback advances to the next speaker like any other skip (existing client logic).

**Tests:** `server/tests/HumanInput.test.js` (+ integration case), mirror submit/panelist cases.

---

#### Client: mirror successful submit wiring

Follow the same split as `handleOnSubmitHumanMessage`:

| Concern | Owner |
|--------|--------|
| Idle timer (museum PTT) | `HumanInput.tsx` |
| Socket emit + index sync + `isRaisedHand` | `useCouncilMachine.ts` via callback |
| Mount / phase | `Council.tsx` (unchanged gate: `liveKey && participationPhase !== "off"`) |

**`HumanInput` abandonment timer** (museum + `phase === "active"` only):

- **Start:** when `phase` becomes `"active"` (entering human turn UI).
- **Stop:** on any button **press** edge (holding button indefinitely pauses the timer).
- **Restart:** on button **release** only (abandoned = released without a successful submit; auto-submit on release with ≥3 words already handles engaged visitors).
- **Destroy:** on unmount / `phase` leaves `"active"`.
- **Duration:** `60_000` ms (hardcoded in `HumanInput`).

On timer fire: call `onAbandonHumanTurn()` prop (name TBD) — do **not** emit socket from `HumanInput` directly.

**`useCouncilMachine.handleOnAbandonHumanTurn`** (parallel to submit):

1. `socket.emit("skip_human_turn")`.
2. Optimistic local conversation trim + index adjustment (same rules as submit where applicable).
3. `setIsRaisedHand(false)`.
4. `calculateNextAction()` → `loading`.

**Index sync after skip** (example):

```
Before (active, invitation already played):
  [0] speaker   playingNowIndex = 1
  [1] invitation
  [2] awaiting_*   playNextIndex = 2

After server + client align:
  [0] speaker
  [1] skipped      ← replaces invitation + awaiting
  [2] next AI turn (from startLoop)
```

`playNextIndex` may already be **2** (was pointing at `awaiting_*`); after update index 2 is the new council message — **may not need to change `playNextIndex`**. Validate against submit's `now`/`next` math during implementation; use existing `skipped` auto-advance at `playNextIndex` if the cursor lands on the marker.

**Invitation audio:** Timer only runs in `phase === "active"`. Invitation always finishes during `warm` / before active — skip will not fire mid-invitation.

**Meta-agent:** Keep `HumanInput` mounted whenever `participationPhase !== "off"` (including `warm` during prior speaker / invitation), even if `metaAgentActive`. Human-input button owner priority already blocks meta-agent during active human turn. Do **not** unmount `HumanInput` on `metaAgentActive`.

---

#### Shared / types

- `shared/SocketTypes.ts` — `skip_human_turn` on `ClientToServerEvents`
- `server/src/models/ValidationSchemas.ts` — empty or minimal payload schema
- `server/src/logic/SocketManager.ts` — register event

---

#### Client tests

- `HumanInput`: timer starts on active, pauses on press, restarts on release, fires callback at 60s, cleared on unmount
- `useCouncilMachine`: skip emit + `isRaisedHand` clear + index behaviour (panelist + raise-hand paths)
- Museum gate: no timer when not `isButtonMuseumMode`

---

#### Files

| File | Change |
|------|--------|
| `server/src/logic/HumanInputHandler.ts` | `handleSkipHumanTurn` |
| `server/src/logic/MeetingManager.ts` | route event |
| `server/src/logic/SocketManager.ts` | listen |
| `shared/SocketTypes.ts` | event type |
| `client/src/council/humanInput/HumanInput.tsx` | 60s timer + `onAbandonHumanTurn` prop |
| `client/src/council/hooks/useCouncilMachine.ts` | `handleOnAbandonHumanTurn` |
| `client/src/council/Council.tsx` | wire callback |

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
