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
