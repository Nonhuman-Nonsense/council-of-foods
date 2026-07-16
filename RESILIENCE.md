# Connection resilience architecture

How the live council survives socket drops without spurious error overlays, deadlocks, lost
user input, or crashes — and the pattern future client-driven actions should follow so they
self-heal by default instead of needing this solved again.

This is a reference doc, not a plan: it describes the architecture as it exists today. The
`docs/` folder is for work-in-progress design docs; once work lands, the durable "how this
works and how to extend it" description belongs here instead.

## Where this lives

- `client/src/council/hooks/pendingIntentStore.ts` — the intent store (zustand) and the
  `PendingIntent` discriminated union.
- `client/src/council/hooks/useCouncilMachine.ts` — the reconciler (one `useEffect`), the
  per-intent apply helpers (`performHumanSubmit`, `performResolveExtension`,
  `performSkipTurn`), and the action handlers that register intents (`raiseHand`,
  `handleOnSubmitHumanMessage`, `handleOnExtendMeeting`/`handleOnConcludeMeeting`,
  `handleOnAbandonHumanTurn`).
- `client/src/council/hooks/useCouncilSocket.ts` — socket lifecycle; clears socket.io's
  `sendBuffer` on disconnect (see "Why the sendBuffer is cleared" below).
- `server/src/logic/*Handler.ts` — server-side idempotency backstop (log-and-ignore on a
  stale/duplicate proxy event instead of crashing the client).

## The core idea

> The DB is the source of truth for the conversation. The client is the source of truth for
> its own pending intent. On reconnect, the client re-asserts that intent after the resume
> handshake completes — it never relies on an in-flight raw socket event surviving the
> disconnect.

socket.io buffers `emit()` calls made while disconnected and flushes them on reconnect —
*before* `attempt_reconnection` is processed — so the server drops them with "no active
session". That's harmless for some events and silently breaks others (lost typed text, a
raised hand the server never learns about, deadlocks). Relying on that buffer replay was the
original failure mode this architecture replaces.

The reconciler is a **desired-state loop**, the same shape as a React render or a controller
reconcile: desired state = the pending intent; observed state = `councilState` + the
conversation + socket health; the reconciler applies the intent whenever observed state makes
it valid, and does this on *every* relevant state change, not just "on reconnect".

**There is no "on reconnect" code path.** Reconnect is just one of several reasons observed
state changes; the reconciler responds to it exactly like it responds to normal playback
progress. On the happy path an intent's precondition is already met, so it fires on the next
tick. On the reconnect path, it waits until the state machine returns to that same
precondition. This is what makes the pattern forget-proof: a future feature can't "forget" the
reconnect race, because there's no separate reconnect path to forget — you write one precondition
+ apply action and both paths get it for free.

## Event taxonomy

Every client → server **socket** proxy event is one of:

- **Kind A — backed by a server-persisted sentinel.** The server already wrote a "waiting"
  marker to the DB (`awaiting_human_question`, `awaiting_human_panelist`, `query_extension`)
  before the client acts; the event just says how to proceed.
- **Kind B — pure client-originated intent, no server sentinel.** The intent exists only on
  the client until the event lands (`raise_hand` is the one example — it's what *creates* the
  sentinel).
- **Telemetry** — fire-and-forget, monotonic, self-heals by resend
  (`report_maximum_played_index`). Deliberately **not** an intent — routing it through the
  reconciler would only add noise.

Every Kind A/B event is intent-backed: `raise_hand`, `submit_human_message` /
`submit_human_panelist`, `extend_meeting` / `conclude_meeting`, `skip_human_turn`.

**This taxonomy only covers socket.io proxy events.** One-off HTTP calls (e.g. the
`meeting_incomplete` → "Resume" flow, `PUT /api/meetings/:id` in
`handleOnAttemptResume`/`resumeMeeting.ts`) are a different transport with no `sendBuffer`, no
`attempt_reconnection` handshake, and no sentinel dance — this pattern doesn't transplant
there as-is. That path currently hard-errors (`setUnrecoverableError`) on any failure,
including a transient network blip; that's a known, accepted gap, not an oversight — see the
plan doc's "meeting_incomplete" discussion if you want to revisit it.

## The `pendingIntentStore` design

A dedicated zustand store, separate from `errorStore` (which owns error/connection *display*
state — the reconciler reads it but intent is its own concern; an intent can exist even with a
perfectly healthy socket, it's just consumed immediately).

Intents are a **discriminated union** with an **exhaustive reconciler switch** — adding a new
`PendingIntent` variant without a matching `case` is a compile error, so the compiler forces
you to write the timing logic before it'll build:

```ts
type PendingIntent =
  | { kind: "raise-hand"; meetingId: number; index: number; humanName: string }
  | { kind: "human-draft"; meetingId: number; text: string; mode: "question" | "panelist"; index: number; speaker?: string }
  | { kind: "resolve-extension"; meetingId: number; choice: "extend" | "conclude"; index: number; date?: string }
  | { kind: "skip-turn"; meetingId: number; mode: "question" | "panelist"; index: number; speaker: string };
```

**Global gate, applied before any per-intent logic runs:**

```
connected && !attemptingReconnect && intent.meetingId === currentMeetingId
```

- `connected && !attemptingReconnect` is the safe version of "send `attempt_reconnection`
  first, then process the queue": the intent just sits in the store until the resume handshake
  completes (`attemptingReconnect` flips false on the first post-reconnect
  `conversation_update`), then the reconciler fires it against fresh server state. No raw
  replay, no ordering hacks.
- `meetingId` tagging means a stale intent can never apply to the wrong meeting (belt-and-
  suspenders alongside clearing the store on `Council` unmount, which covers SPA navigation
  between meetings — a full page reload clears the in-memory store for free).

**Per-intent policy** (the only thing a new feature author writes) = a precondition + an apply
action:

| Intent | Precondition (beyond the global gate) | Apply |
|--------|----------------------------------------|-------|
| `raise-hand` | conversation has no trailing `awaiting_*` / invitation | emit `raise_hand` |
| `human-draft` | `councilState` is `human_input` / `human_panelist` | auto-submit the retained text (`performHumanSubmit`) |
| `resolve-extension` | `councilState` is `query_extension` | emit `extend_meeting` / `conclude_meeting` (`performResolveExtension`) |
| `skip-turn` | `councilState` is `human_input` / `human_panelist` | emit `skip_human_turn` (`performSkipTurn`) |

## Rules for adding a new intent

These are invariants, not suggestions — each one exists because skipping it caused a real bug
during development (see the plan doc for the specific incidents).

1. **Clear on observed fulfillment, never at emit time.** The reconciler must clear an intent
   only once the *server's* state confirms it landed (e.g. the sentinel it targets is gone),
   never right before/after the `emit()` call that requests it. Clearing at emit time means a
   request lost between `emit()` and the server actually processing it (a disconnect in that
   exact instant) has no durable intent left to retry — recovery quietly falls back to relying
   on socket.io's `sendBuffer`, which is precisely the failure mode this whole architecture
   replaces. (Caught during `raise-hand`'s review, PR 3.)
2. **The shared apply helper must be fully self-contained.** It's called from two different
   moments — the direct user action, and the reconciler's retry — that can't assume the same
   preconditions were "just" established. Re-derive everything (indices, truncation targets)
   fresh from current state on every call; don't let one caller rely on state a *different*
   caller set up. (Caught in `resolve-extension`, PR 5: the apply helper didn't own its own
   truncation, so a retry re-emitted without removing the sentinel, and the state machine
   immediately flipped back and re-triggered the reconciler — an infinite loop.)
3. **Don't assume `councilState` naturally re-derives on its own.** It only does so via the
   main state-machine effect's usual "sentinel appeared → flip councilState" checks. If your
   apply action's local optimistic update interacts with *another*, unrelated local-only
   effect (e.g. the "step past a `skipped` message" progression), the two can compound to move
   `playNextIndex` somewhere the restored server state doesn't line up with — silently
   stranding the retry forever, no crash, no error, it just never fires. If the reconciler
   detects this desync (the intent's captured index doesn't match `playNextIndex`), force the
   index back in sync before checking `councilState`. (Caught in `skip-turn`.) When in doubt,
   write the disconnect-mid-flight retry test — both of the bugs above were only visible under
   that specific test, not the happy path.
4. **Idempotency backstop on the server.** Because clearing waits for fulfillment, the
   reconciler may emit the same request more than once (once, then again after a reconnect, if
   the first attempt's outcome is ambiguous). The server absorbing a duplicate/stale request
   harmlessly (log-and-ignore, not `reportAndCrashClient`) is required, not optional, for this
   to be safe.
5. **Human control wins.** An explicit, opposing user action (lowering the hand, clearing
   typed text) removes the corresponding intent rather than letting it fire later.
6. **The server remains the last line of defense.** Client preconditions mirror the server's
   own state guards so a well-behaved client never emits something the server would reject —
   but the server's guard staying in place (gracefully) is what makes client bugs non-fatal.

## Testing pattern

Every intent has (at minimum) four tests in `useCouncilMachine.test.tsx`:

1. **Happy path, no double-fire** — direct action applies once; the reconciler observes its own
   fulfillment on the very next pass and clears without re-emitting.
2. **Self-heal after a disconnect** — register the intent while `attemptingReconnect` is true
   (closes the gate), verify no retry fires while closed, then complete the handshake with a
   `conversation_update` that still shows the original (unprocessed) sentinel, and verify the
   reconciler retries with the *retained* data (not re-derived from whatever's current — see
   `resolve-extension`'s captured `date`).
3. **Mode variants** where relevant (question vs. panelist).
4. **Stale `meetingId` guard** — an intent tagged for a different meeting never applies.

`simulateReconnect()` must be called *after* the `onConversationUpdate` that sets up initial
state, not before — `onConversationUpdate` itself always clears `attemptingReconnect` as a side
effect (that's what "handshake complete" means), so calling it in the wrong order immediately
re-opens the gate you were trying to close.

## Server-side conversation-loop resilience

Everything above is the client's half: how a client-originated intent survives a disconnect.
This section is the mirror image — how the **server's** own in-progress work (the run loop
generating turns, concluding the meeting, summarizing it) survives a crash or a reconnect
without duplicating work, losing it, or racing itself. Same core idea, same DB-is-truth
principle, applied to server-owned state instead of client-owned intent.

### Where this lives

- `server/src/logic/MeetingManager.ts` — the run loop itself (`runLoop`/`startLoop`), the
  single-loop invariant, and the circuit breaker.
- `server/src/logic/MeetingLifecycleHandler.ts` — `handleConcludeMeeting` /
  `generateSummary` (the durable-marker pattern below) and `promoteMeetingCompleteIfReady`.
- `server/src/logic/ConnectionHandler.ts` — reconnect: regenerates any message missing audio,
  and re-runs the `meetingComplete` promotion if a crash landed between the summary write and
  the promotion.
- `server/src/api/replayManifest.ts` — `stripAwaitingHumanTail` vs. the replay-only strip (see
  "The resume vs. replay trap" below — the one gotcha in this section worth re-reading before
  touching either).

### The single-loop invariant

`runLoop` is the one and only actor that turns pending conversation state into the next state
(next AI turn, panelist invite, extension sentinel, conclude, summary). Everything else —
socket events, playback-progress pings, reconnects — only ever *requests* a pass via
`startLoop()`; none of them mutate the conversation directly.

Three separate fields, not one overloaded boolean, because a single flag was asked to mean
three different things at once and that conflation was the original bug (a "loop stopped"
signal was reused, incorrectly, as a "safe to start a second loop" signal):

- `loopRunning` — true only while `runLoop` executes; owned exclusively by `runLoop`
  (set on entry, cleared in `finally`). The sole guard against two concurrent loops.
- `wakeRequested` — a latch every `startLoop()` sets and `runLoop` re-checks before exiting a
  terminal turn, so a wake arriving mid-turn (very common: `report_maximum_played_index` fires
  on every playback tick) is never lost.
- `isActive` — session liveness, unrelated to whether a loop is currently running. Set false by
  `destroy()`/disconnect; checked by the loop's `while` and by in-flight generation.

Without this split, a single `isLoopActive` flag flipped false *before* an async terminal action
(e.g. conclude) actually finished meant any of several unrelated `startLoop()` callers could
race into that window and spawn a second, fully concurrent loop — which duplicated the conclude
indefinitely and blew past the TTS provider's concurrency limit. This is the incident the whole
section below exists to prevent from recurring in a different shape.

### Circuit breaker

`runLoop` checks conversation length against a **fixed, hardcoded** ceiling
(`ABSOLUTE_MAX_CONVERSATION_LENGTH`) every iteration, before doing anything else. Deliberately
*not* derived from `serverOptions.meetingVeryMaxLength`: a value read from config could itself
be misconfigured (or, in prototype mode, overridden by the client) and silently raise the
ceiling right along with whatever bug it was meant to catch. A circuit breaker whose trip point
can drift with the thing it's guarding against isn't one. If this ever fires, treat it as
"something we haven't thought of yet" — it means a genuine invariant broke upstream, not that a
meeting was configured to run long.

### The durable-marker pattern (`summary_pending`)

This is the server-side analogue of `pendingIntentStore`: a piece of state that says "this work
is still owed" and is durable enough (persisted in the DB, part of `conversation`) to survive a
crash, a disconnect, or a reconnect — so recovery is just "the loop runs again and picks up
where the marker says to."

Concluding a meeting works in two steps instead of one:

1. **Trigger + marker, written atomically.** `handleConcludeMeeting` generates the chair's
   closing line and pushes it **and** a `{ type: "summary_pending" }` marker in a single DB
   write. There is never a persisted or broadcast state with the closing line but no marker —
   no await separates the two pushes.
2. **The loop resolves the marker.** `decideNextAction` treats a trailing `summary_pending` as
   the *first* priority check — ahead of pause/hand-raised/cap/playback-buffer — so a stale
   `handRaised` carried in on reconnect can never strand a conclusion. It returns
   `GENERATE_SUMMARY`, which calls `generateSummary()`: generate the summary, replace the marker
   **in place** with the real `summary` message, then queue its audio and (once idle) run
   `promoteMeetingCompleteIfReady`.

Because resolution is just another loop turn, the happy path and crash recovery are *the same
code path* — there's no separate "resume a stale conclude" branch to forget to write or to let
drift out of sync with the live version, the same way the client's reconciler has no separate
"on reconnect" branch. A disconnect at any point before the marker is resolved just means: next
time a session runs the loop for this meeting, `decideNextAction` sees the marker again and
calls `generateSummary()` again — exactly once, never a duplicate closing line, because the
closing line was already committed in step 1 and step 2 only ever *replaces* the marker.

`generateSummary` also self-heals a narrower gap on its own: it checks for the marker's
existence before spending an LLM call (idempotent no-op if already resolved), and audio for the
summary is regenerated automatically by the existing "missing audio" reconnect scan
(`ConnectionHandler`) the same way any other message's audio would be — no `summary_pending`
special case was needed there, because "does this message have audio" doesn't care why the
audio is missing.

### The resume vs. replay trap

`stripAwaitingHumanTail` is shared by two callers with **opposite correctness requirements**,
and conflating them once already produced a real bug:

- **Resume** (`buildResumeConversation`, used by `resumeMeeting.ts`) writes its result straight
  back to the DB. It must **keep** `summary_pending` — stripping it would drop the "still owed"
  marker from the persisted document, and the next live session would never regenerate the
  summary.
- **Replay** (`buildReplayMeetingManifest`) is read-only display with no live server behind it.
  It must **strip** `summary_pending` (separately, just for that path) and fall through to
  `meeting_incomplete`, because there's nothing that will ever resolve the marker for a
  read-only viewer.

The rule going forward: **anything that persists a "sanitized" conversation back to the DB must
preserve every durable marker; only a genuinely read-only display path may strip one.** If you
add a new durable marker, check both call sites, not just the one you're testing against.

### Reconnect-churn write guard

`handleConcludeMeeting`/`generateSummary` check `!manager.isActive` immediately after their one
slow `await` (the LLM call), right before writing. This isn't the single-loop invariant above —
it guards a different, narrower race: `destroy()` can't cancel an already-in-flight LLM-call
promise (only the audio queue has a cancellation token), so if a session is torn down mid-await
(e.g. preempted by a reconnect) its orphaned promise chain is still alive in memory and will
eventually resolve. The check stops that orphaned chain from doing a stale full-array DB write
after a newer manager has already taken over the same meeting. Cheap because it's just a flag
read at each checkpoint — no fencing token needed, because each reconnect constructs a brand-new
`MeetingManager` rather than rebinding an existing one, so "torn down" and "a different manager
now owns this meeting" collapse to the same `isActive` check.

### Rules for adding a new durable server-side marker

Same spirit as "Rules for adding a new intent" above, restated for markers the *server* owns:

1. **Trigger and marker are one atomic write.** Never persist the action the marker is meant to
   follow up on without the marker in the same write — an await between the two reopens exactly
   the "closing line but no marker" gap `summary_pending` was built to close.
2. **Resolution must be a single code path for both the happy path and recovery.** If reconnect
   needs its own bespoke "finish this up" branch instead of just re-running the loop, that
   branch will drift from the live version the first time either one changes.
3. **Resolving must be idempotent.** Check the marker still exists before doing the (expensive)
   work; a duplicate wake or a re-entrant call must be a cheap no-op, not a duplicate LLM/TTS
   call.
4. **Read-only display paths strip; DB-persisting paths preserve.** See "The resume vs. replay
   trap" — check every caller of a shared sanitizer, not just the one under test.
5. **Guard multi-await chains with a liveness check before the final write.** Anything with more
   than one `await` between "decided to act" and "wrote the result" needs an `isActive`-style
   check right before that write, for the same reason described above.
