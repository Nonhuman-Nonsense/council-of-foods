# PTT × HumanInput — museum mode integration & routing plan

Connects the serial push-to-talk button to the `HumanInput` component during a council meeting, with a routing contract that is forward-compatible with the future meta-agent.

> Implements on **`foods-leo`**. The pre-warm PR (`human-participation-prewarm-plan.md`) must land first — this builds directly on `startRecording()` / `finishRealtimeSession()` being standalone functions and the `ready` state existing.

---

## Goals

- Hold button → mic opens instantly (pre-warm already guarantees this).
- Release button → recording stops and transcript auto-submits (museum: no manual submit needed).
- In museum+PTT mode: hide the mic icon; show a "hold to talk" placeholder; no manual submit button.
- In web mode or without PTT: no change from today.
- PTT and LED mode ownership transfer cleanly when `HumanInput` mounts/unmounts (so the future meta-agent can also hold PTT without conflicts).

---

## Current wiring (what exists)

| Piece | What it does |
|-------|-------------|
| `usePushToTalkStore` | Global Zustand store. Owns `pressed`, `ledMode`, `pttInputEnabled`. Serial + keyboard events call `setPressed`. `pttInputEnabled` is true only when `ledMode === "pulse" \| "on"`. |
| `MeetingVoiceGuide` | Sets `ledMode` to `"pulse"/"on"` during the pre-meeting voice guide, clears to `"off"` on unmount. This is the only component that currently manages LED in a meeting context. |
| `HumanInput` | Has no PTT wiring today. `startRecording()` and `finishRealtimeSession()` exist as standalone functions after the pre-warm PR. |
| `talkButtonService` | Keeps the serial port auto-connected in the background. Knows nothing about who "owns" the button. |

The key observation: **whoever sets `ledMode("pulse")` owns the button**. When that component unmounts and calls `setLedMode("off")`, input is disabled and the next owner can claim it.

---

## Routing mechanism: `usePttOwnership`

To avoid two components fighting over `ledMode` we introduce a single tiny ownership layer. This is **not** a new complex system — it's 30 lines that replace the current implicit first-come-first-served behaviour.

### `client/src/museum/talkButton/pttOwnership.ts` (new)

```ts
/**
 * Tracks which component currently holds the PTT button.
 *
 * Components call claim(id) on mount and the returned release() on unmount.
 * Only the current owner is allowed to set ledMode and react to pressed events.
 * Later claims always win (stack semantics: HumanInput > meta-agent > none).
 */

type PttOwner = { id: string; priority: number };
let owners: PttOwner[] = [];

function currentOwner(): string | null {
  if (owners.length === 0) return null;
  return owners[owners.length - 1].id;
}

export function claimPtt(id: string): () => void {
  owners = [...owners.filter(o => o.id !== id), { id, priority: owners.length }];
  return () => {
    owners = owners.filter(o => o.id !== id);
  };
}

export function getCurrentPttOwner(): string | null {
  return currentOwner();
}
```

This is framework-free (no React, no Zustand) — just a module-level stack. Any component can call `claimPtt("human-input")` on mount and the returned cleanup on unmount.

**Stack semantics:** `HumanInput` mounts after the meta-agent, so it is always the top-of-stack. On unmount, the meta-agent is back on top.

---

## Changes to `HumanInput`

### New prop

```ts
interface HumanInputProps {
  phase: ParticipationPhase;
  isPanelist: boolean;
  currentSpeakerName: string;
  onSubmitHumanMessage: (text: string) => void;
  liveKey: string;
  isPttMuseumMode?: boolean; // isMuseumMode && getPushToTalk()
}
```

`Council` computes `isPttMuseumMode` and passes it down (no hook inside `HumanInput`; keeps component pure).

### LED management effect

```ts
useEffect(() => {
  if (!isPttMuseumMode) return;
  const release = claimPtt("human-input");
  return () => {
    void setLedMode("off");
    release();
  };
}, [isPttMuseumMode]);

useEffect(() => {
  if (!isPttMuseumMode) return;
  if (connectionState === "recording") {
    void setLedMode("on");
  } else if (connectionState === "ready" || connectionState === "connecting") {
    void setLedMode("pulse");
  }
}, [isPttMuseumMode, connectionState]);
```

`pulse` = "ready, please speak". `on` = "recording now". `off` = component unmounted / not PTT mode.

### PTT press/release effect

```ts
// Read from store at the top of the component
const pressed = usePushToTalkStore(s => s.pressed);

useEffect(() => {
  if (!isPttMuseumMode) return;
  if (pressed && connectionState === "ready") {
    startRecording();
  }
}, [pressed, isPttMuseumMode]);

useEffect(() => {
  if (!isPttMuseumMode) return;
  if (!pressed && connectionState === "recording") {
    autoSubmitAfterFinish.current = true; // see below
    finishRealtimeSession();
  }
}, [pressed, isPttMuseumMode]);
```

### Auto-submit on PTT release

```ts
const autoSubmitAfterFinish = useRef(false);

// In the transcript effect, when state returns to "ready":
useEffect(() => {
  if (
    connectionState === "ready" &&
    autoSubmitAfterFinish.current &&
    inputValue.trim().length > 0
  ) {
    autoSubmitAfterFinish.current = false;
    onSubmitHumanMessage(inputValue.substring(0, maxInputLength));
    setInputValue("");
    setPreviousTranscript("");
    setTranscriptSegments([]);
    setCanContinue(false);
  }
}, [connectionState]);
```

### UI changes in PTT museum mode

```tsx
// Hide mic icon
{!isPttMuseumMode && (
  <img alt="Say something!" src={micIcon} style={micStyle} />
)}

// Hide mic button row entirely (LED button on the physical hardware is the control)
// Instead show a visual state indicator:
// connecting/ready → "Press and hold to talk"
// recording → "Recording..." (or visualizer only)

// Placeholder text
placeholder={
  isPttMuseumMode
    ? t("human.ptt_museum")   // "Press and hold the button to talk, release to submit"
    : isPanelist
      ? t("human.panelist", { name: currentSpeakerName })
      : t("human.1")
}
```

No manual send button or mic icon in PTT museum mode. The hardware button is the whole interaction. Text input via the textarea still works as fallback (auto-submit on Enter still fires in PTT museum mode).

---

## Changes to `Council`

```ts
// New import
import { getPushToTalk } from "@/settings/councilSettings";
import { useAppMode } from "@/museum/useAppMode";

// Inside component
const { isMuseumMode } = useAppMode();
const isPttMuseumMode = isMuseumMode && getPushToTalk();

// Pass down
<HumanInput
  phase={participationPhase}
  isPttMuseumMode={isPttMuseumMode}
  ...
/>
```

`getPushToTalk()` is a synchronous localStorage read (no re-render needed; PTT setting doesn't change during a live meeting).

---

## Future meta-agent PTT routing

When the meta-agent is built, it will be a component mounted above `Council` (likely in `Main.tsx` or alongside it) with its own connection to an Inworld agent session.

**How it claims PTT:**

```ts
// Inside the meta-agent component
useEffect(() => {
  const release = claimPtt("meta-agent");
  // After claiming, activate LED
  void setLedMode("pulse");
  return () => {
    void setLedMode("off");
    release();
  };
}, []);
```

**Why the routing is correct:**

- Meta-agent mounts first (app shell level) → claims PTT.
- `HumanInput` mounts when `participationPhase !== "off"` → claims PTT (becomes top-of-stack).
- `HumanInput` unmounts → releases → meta-agent is back on top → its own LED/pressed effects reactivate.

The meta-agent needs to observe `getCurrentPttOwner()` to know whether it is the active owner before reacting to `pressed`. It also needs to re-activate its LED when it becomes top-of-stack again (i.e., when `HumanInput` releases). It can do this by subscribing to ownership changes:

```ts
// pttOwnership.ts addition (optional, for meta-agent):
type OwnerChangeListener = (owner: string | null) => void;
let listeners: OwnerChangeListener[] = [];

export function onPttOwnerChange(fn: OwnerChangeListener): () => void {
  listeners = [...listeners, fn];
  return () => { listeners = listeners.filter(l => l !== fn); };
}
// call listeners in claimPtt / release
```

This listener is a couple of extra lines and not needed for `HumanInput` itself.

**Pausing the meeting during meta-agent PTT:**

When the meta-agent gets a `ptt_down` event while it is the owner, it can call `setPaused(true)` (already threaded from `Council` to `Main`). On `ptt_up`, it resumes. This is a separate concern from routing — no changes to `HumanInput` needed.

---

## Files

| Path | Change |
|------|--------|
| `client/src/museum/talkButton/pttOwnership.ts` | New — claim/release + optional change listener |
| `client/src/council/humanInput/HumanInput.tsx` | `isPttMuseumMode` prop; LED effects; press/release effects; auto-submit ref; UI conditionals |
| `client/src/council/Council.tsx` | Compute `isPttMuseumMode`; pass to `HumanInput` |
| `client/src/locales/**` | Add `human.ptt_museum` key |
| `client/tests/unit/components/HumanInput.test.jsx` | PTT mode tests: LED lifecycle, press→record, release→autosubmit, non-PTT unchanged |
| `client/tests/unit/museum/talkButton/pttOwnership.test.ts` | Claim/release semantics; stack order |

---

## Tests

### `pttOwnership`
- Default owner is `null`.
- Single claim → owner is set; release → null.
- Two claims (meta-agent, then human-input) → current owner is human-input; human-input releases → meta-agent.

### `HumanInput` with `isPttMuseumMode=true`
- Mount → `setLedMode("pulse")` called (via `usePushToTalkStore` mock).
- `ready` + `pressed` fires → `startRecording()` called.
- `recording` + `pressed` releases → `finishRealtimeSession()` called + `autoSubmitAfterFinish.current = true`.
- State reaches `ready` after finishing with text → `onSubmitHumanMessage` called automatically.
- Unmount → `setLedMode("off")` called.
- With `isPttMuseumMode=false` → none of the above.
- Mic icon hidden; send button hidden; PTT placeholder shown.

### `HumanInput` non-PTT mode (regression)
- All existing tests still pass unchanged.

---

## Implementation order

1. `pttOwnership.ts` + unit tests (5 min).
2. LED effects + PTT press/release in `HumanInput` (`isPttMuseumMode` prop).
3. Auto-submit on release.
4. UI: hide mic icon + button row; PTT placeholder text.
5. `Council` computes and passes `isPttMuseumMode`.
6. Add `human.ptt_museum` locale key (en + sv).
7. Update `HumanInput` tests.

---

## Open questions

1. **Visualizer in PTT mode?** The waveform visualizer (`LiveAudioVisualizerPair`) is currently wired to the mic stream. Keep it visible during recording even in PTT mode (useful feedback that the button is working), or hide it along with the mic icon?
2. **Fallback submit button?** In PTT mode but active phase, do we show a submit button for any text the visitor typed manually (edge case)? Suggest: yes, show submit only if text is non-empty and `!isRecording` — so a visitor who typed a note can still send it.
3. **LED during warm phase?** Currently plan is `pulse` from the moment `HumanInput` mounts (even in warm phase). Alternative: don't activate LED until active phase. Recommend `pulse` from warm — it signals to the visitor that the button will work soon (pre-meeting briefing mentioned "press the button to speak").
4. **`getPushToTalk()` re-reads on every render** in `Council`. This is fine (synchronous, fast) but wraps it in a `useMemo` if it ever becomes a concern.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-19 | Initial plan: pttOwnership layer, HumanInput PTT effects, meta-agent routing contract |
