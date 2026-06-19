# Human participation — pre-warm implementation plan

Pre-warm the HumanInput realtime (WebRTC) session **before** the visitor's floor opens, so the mic is ready instantly. Keep the design simple: **no context, no new custom hooks, no separate phase layer**. One plain function decides the phase; `Council` decides when `HumanInput` is mounted; `HumanInput` owns its own connection + recording state (as it already does).

> Implement on **`foods-leo`** (upstream Council of Foods). Forest merges manually afterwards.

**Related:** [museum-mode-plan.md](./museum-mode-plan.md) — museum push-to-talk and the meta agent are later, separate work.

---

## Core idea

Lifecycle is driven by **React mount/unmount**, not an internal `enabled` flag.

- Mount `HumanInput` during the **warm** phase (previous message playing, human floor is next) → it connects with the mic gated.
- `warm → active` keeps the **same component instance** mounted → connection persists → instant mic.
- Any cancellation (raise hand truncates messages, skip, submit, meeting advances) drops the phase to **off** → `HumanInput` unmounts → its **existing unmount cleanup** closes the connection. No special-case code.
- A new human floor later → remount → fresh connection.

This is why we don't need a context/hook/layer: the component already tears itself down on unmount.

```365:374:client/src/council/humanInput/HumanInput.tsx
  useEffect(() => {
    return () => {
      clearFinishingTimers();
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
      setMicStream(null);
    };
  }, []);
```

---

## Playback index semantics

| Index | Meaning |
|-------|---------|
| `playingNowIndex` | Message whose audio is playing (or last played). |
| `playNextIndex` | Cursor the state machine tries to reach next. |

While a message plays, `playingNowIndex === playNextIndex` until it finishes; `playNextIndex` only advances afterward in `calculateNextAction()`.

**Warm signal:** `textMessages[playingNowIndex + 1]` is `awaiting_human_question` or `awaiting_human_panelist`. This is the message *after* what's currently playing — covers both the first-time invitation case and the later "given the mic directly" case, without special-casing invitations.

---

## Phase (one plain function)

```ts
// client/src/council/humanInput/participationPhase.ts
import type { Message } from "@shared/ModelTypes";
import type { CouncilState } from "../hooks/useCouncilMachine";

export type ParticipationPhase = "off" | "warm" | "active";

export function getParticipationPhase(
  councilState: CouncilState,
  textMessages: Message[],
  playingNowIndex: number,
): ParticipationPhase {
  if (councilState === "human_input" || councilState === "human_panelist") {
    return "active";
  }
  const upcoming = textMessages[playingNowIndex + 1];
  if (
    upcoming?.type === "awaiting_human_question" ||
    upcoming?.type === "awaiting_human_panelist"
  ) {
    return "warm";
  }
  return "off";
}
```

Pure, no React, trivially unit-testable. (Dropped the `playNextIndex` fallback from the earlier draft — `playingNowIndex + 1` covers the real cases.)

---

## Council wiring

Replace the current conditional mount:

```ts
// inside Council, alongside other derived values
const participationPhase = getParticipationPhase(councilState, textMessages, playingNowIndex);
```

```tsx
{liveKey && participationPhase !== "off" && (
  <HumanInput
    phase={participationPhase}
    isPanelist={councilState === "human_panelist"}
    currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""}
    liveKey={liveKey}
    onSubmitHumanMessage={handleOnSubmitHumanMessage}
  />
)}
```

One gate covering `warm || active` keeps the same `HumanInput` instance across the transition — this is what enables pre-warm. (Replaces the existing `councilState === 'human_input' || 'human_panelist'` block.)

---

## HumanInput changes (Option A — one explicit state machine)

All state stays inside `HumanInput`. The only real change is **decoupling connection from recording**.

### State machine

Today:

```
idle → loading → recording → finishing
```

New:

```
idle → connecting → ready → recording → finishing
                     ▲ connected, mic track.enabled = false (gated)
```

| State | Connection | Mic track | UI |
|-------|-----------|-----------|-----|
| `idle` | none | — | none |
| `connecting` | handshaking | created, disabled | none (warm) / loading (active) |
| `ready` | open | disabled | none (warm) / mic ready (active) |
| `recording` | open | enabled | live transcript |
| `finishing` | open, closing | disabled | transcript settling |

### Behaviour by phase

- **Mount / `phase` is `warm` or `active` and state is `idle`** → start connecting (existing `startRealtimeSession` logic) but **land in `ready` with the mic track disabled**, instead of jumping to `recording`.
- **`phase === "active"` + user starts** (web: mic click; museum PTT later) → enable mic track, go `recording`. Instant because handshake already happened.
- **Pre-warm not finished when active** → state is `connecting`; show the existing Lottie loading until `ready`/`recording`.
- **Stop / submit / unmount** → existing teardown unchanged.

### Concrete edits

1. **Add `phase` prop** to `HumanInputProps` (`"warm" | "active"`).
2. **Rename state type** `RecordingState` → include `connecting` and `ready`; replace `loading`.
3. **Split `startRealtimeSession`** into:
   - `connect()` — bootstrap + `createRealtimeConnection`, set `connectionRef`/`micStream`, **disable mic track**, set state `ready`. (Move the current body here; remove the `setRecordingState('recording')` at the end.)
   - `startRecording()` — guard `state === "ready"`, enable mic track (`micStream.getAudioTracks().forEach(t => t.enabled = true)`), set `recording`.
4. **Mic gating:** after connect, `connection.micStream.getAudioTracks().forEach(t => t.enabled = false)` (mirrors how `finishRealtimeSession` already disables tracks).
5. **Auto-connect effect:** on mount / when `idle` and `phase !== "off"`, call `connect()` (StrictMode-safe via existing `startAbortRef`).
6. **Mic button (`handleStartStopRecording`)** in `active`:
   - `ready` → `startRecording()`
   - `recording` → `finishRealtimeSession()`
   - `connecting` → no-op (or cancel), show loading.
7. **Loading UI condition:** `phase === "active" && (state === "connecting")` → Lottie.
8. **Unmount cleanup:** unchanged (already closes everything).

Keep `startRecording()` and `finishRealtimeSession()` as **standalone reusable functions** (not logic buried inside the click handler) so the push-to-talk follow-up can call them from serial/keyboard events without refactoring.

### Mic gating: use `track.enabled`, not `micGainGate`

`micGainGate` (Web Audio gain node) was added for **voice-guide push-to-talk**; it keeps the mic track continuously live and gates audio by gain `0/1`. We do **not** use it here:

- During `warm` (potentially long), `track.enabled = false` sends **zero audio** → STT bills nothing. A gain gate would keep silence flowing, which is wasteful for a long warm window.
- `track.enabled` toggling is simpler and sufficient for transcription gating.

The PTT follow-up can revisit `track.enabled` toggling vs `micGainGate` for rapid press/release smoothness; this PR does not depend on that choice.

---

## Cancellation edge cases (all handled by unmount)

| Event | Phase result | What happens |
|-------|--------------|--------------|
| Raise hand during panelist pre-warm | messages truncated → `playingNowIndex+1` no longer awaiting → `off` | `HumanInput` unmounts → connection closed; after server invite, warm again → remount |
| Submit answer | messages sliced, `councilState` → loading → playing → `off` | unmount → teardown |
| Skip forward past awaiting | upcoming no longer awaiting → `off` | unmount → teardown |
| Two humans back-to-back (rare) | submit → brief `off` → next awaiting → `warm` | second floor may skip pre-warm if no audio gap — acceptable |
| Navigate away / meeting end | `liveKey` cleared / Council unmounts → `off` | unmount → teardown |
| Replay (`!liveKey`) | gate is false | never mounts |

No raise-hand-specific code in `HumanInput` or `Council`.

---

## Files

| Path | Change |
|------|--------|
| `client/src/council/humanInput/participationPhase.ts` | New pure function + type |
| `client/src/council/Council.tsx` | Compute phase; widen mount gate; pass `phase` |
| `client/src/council/humanInput/HumanInput.tsx` | `phase` prop; `idle/connecting/ready/recording/finishing`; split connect/record; mic gating; loading on `connecting` |
| `client/tests/unit/council/participationPhase.test.ts` | New unit tests |
| `client/tests/unit/components/HumanInput.test.jsx` | Update for `phase` prop + connect/record split |
| `client/tests/unit/components/Council.test.tsx` | Mount in warm + active |

---

## Tests

### `getParticipationPhase` (unit)

| Input | Expected |
|-------|----------|
| `human_input` | `active` |
| `human_panelist` | `active` |
| playing at `N`, `N+1` = `awaiting_human_question` | `warm` |
| playing invitation at `N`, `N+1` = `awaiting_human_panelist` | `warm` |
| playing at `N`, `N+1` = normal message | `off` |
| `N+1` out of bounds | `off` |
| raise hand truncated tail, `N+1` not awaiting | `off` |

### `HumanInput` (component)

- Mount with `phase="warm"` → bootstrap called once; **no recording**, mic track disabled; no mic-active UI.
- `phase="warm"` → `phase="active"` (same instance) → **no second bootstrap**; mic click → `recording` immediately (already `ready`).
- Mount with `phase="active"` while still connecting → loading UI; becomes ready → recordable.
- Unmount during `warm`/`connecting` → `connection.close()` called; in-flight bootstrap aborted.
- Submit → `onSubmitHumanMessage` with text; teardown.

### `Council` (component)

- `warm` phase → `HumanInput` present (offscreen/no mic UI).
- `active` → `HumanInput` interactive.
- Phase `off` → not rendered.

### Manual

1. Raise hand → invitation plays → floor opens with mic instantly ready.
2. Panelist scheduled → warm during panelist speech → instant floor.
3. **Raise hand during panelist pre-warm** → no stuck mic, no duplicate session; re-warms after invite.
4. Submit → council continues; no leaked connection.
5. Replay → no realtime session.

---

## Implementation order (single PR)

1. Add `participationPhase.ts` + unit tests.
2. Refactor `HumanInput` state machine: `connecting/ready` + split connect/record + mic gating + auto-connect effect + loading-on-connecting.
3. Wire `Council`: compute phase, widen mount, pass `phase`.
4. Update `HumanInput` and `Council` tests.
5. Manual pass on the raise-hand cancellation scenario.

Museum push-to-talk is a **follow-up PR** on top of this `ready` state (see below).

---

## Forward compatibility: push-to-talk + auto-submit (next PR)

Not implemented here, but the Option A design must not block it:

- **PTT down** (serial/keyboard, when `ready`) → `startRecording()`.
- **PTT up** → `finishRealtimeSession()`.
- **Museum auto-submit:** in museum mode, after release and the transcript finalizes, automatically call `onSubmitHumanMessage` instead of waiting for a manual submit/Enter.

What this PR must get right so the follow-up is clean:

1. `startRecording()` / `finishRealtimeSession()` are standalone functions (above).
2. The `finishing` flow has a clear completion point (transcript finalized) where the follow-up can hook auto-submit — keep the finalize → settle logic in one place, don't scatter it across timers and handlers.
3. The `ready` state means "connected, mic gated, awaiting a start trigger" — equally driven by a click (web) or a PTT event (museum). Don't hard-couple the start trigger to the mouse.

No PTT code, LED policy, or serial wiring in this PR.

---

## Open questions

1. Auto-start recording on `active` when already `ready`? Keep web click-to-start for now; museum PTT later.
2. Tear down a long-lived `warm` connection if it idles near Inworld's ~15 min TTL? Council turns are short before the human floor; reconnect on `active` if errored. Defer unless observed.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-19 | Simplified: one pure `getParticipationPhase`, widened mount gate, `connecting/ready` split in `HumanInput`; removed context/hooks/phase-layer from earlier draft |
| 2026-06-19 | Clarified mic gating (`track.enabled`, not `micGainGate`); added forward-compat section for PTT + museum auto-submit |
