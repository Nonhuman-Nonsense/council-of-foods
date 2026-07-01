# Realtime captions, PTT keyboard fix & audio visualizer

Plan for fixing museum-mode Spacebar PTT, adding a push-to-talk audio visualizer to
realtime voice sessions (voice guide + meta agent), and aligning subtitle sizing and
position across contexts.

> **Related docs:** [meta-agent-realtime-ux-plan.md](./meta-agent-realtime-ux-plan.md)
> (shared `RealtimeCaptionOverlay`, session glue), [ptt-human-input-routing-plan.md](./ptt-human-input-routing-plan.md)
> (button claim priority, HumanInput PTT).

**Status:** Phase 1 implemented. Phases 2–5 pending.

---

## Goals

1. **Spacebar PTT works in museum mode** the same as web mode (voice guide, meta agent, and any future PTT consumer).
2. **Instant visual feedback** while the visitor holds PTT during realtime voice sessions — reuse the `LiveAudioVisualizerPair` pattern from `HumanInput`.
3. **Subtitle consistency:**
   - Meta agent + museum voice guide: same size and position as council meeting subtitles.
   - Web voice guide: keep current compact sizing; shift captions up slightly when the visualizer slot is reserved.
4. **Minimal new surface area** — extend existing components (`RealtimeCaptionOverlay`, `useRealtimeVoiceSession`, `buttonStore`) rather than many small modules.

---

## Problems found (analysis)

### Museum Spacebar does nothing

Keyboard handling lives in `buttonStore.ts`. Space always updates `rawPressed`, but only
updates routed `pressed` when `buttonInputEnabled` is true:

```ts
set({ rawPressed: true });
if (get().buttonInputEnabled) {
  get().setPressed(true, "keyboard");
}
```

On every bridge `disconnected` / `error` event, the store forces `buttonInputEnabled = false`
—even when a feature has already claimed the button (`voice-guide`, `meta-agent`, etc.).

In **push-to-talk** with **Hardware button** enabled, `MuseumButton` enables auto-reconnect to the hardware bridge. Each
failed or dropped connection clears `buttonInputEnabled`. If the bridge daemon is not
running, this happens repeatedly and `pressed` never becomes true from the keyboard.

In **web mode**, this is masked: `disconnect()` runs once (no reconnect loop), then a
feature `claim()` restores `buttonInputEnabled` via `applyLedMode`.

**Why HumanInput can appear to work:** it reads `rawPressed` in addition to routed
`pressed` — an exceptional workaround, not the model we want for voice guide / meta agent.

**Why voice guide and meta agent fail:** they only use routed `pressed`, which is gated by
the broken `buttonInputEnabled` flag (cleared on bridge disconnect) instead of the LED
state the features already control.

**Fix (Phase 1):** `pressed = (ledMode !== "off") && (keyboardDown || hardwareDown)`.
Bridge lifecycle only clears `hardwareDown`. Drop `buttonInputEnabled` and `rawPressed`.

### No audio visualizer on realtime sessions

`HumanInput` already renders `LiveAudioVisualizerPair` while recording. Realtime voice
sessions (`useRealtimeVoiceSession`) gate the mic via `setMicEnabled` but do not expose
the `MediaStream` or reserve bottom-of-screen layout for a visualizer.

### Subtitle sizing mismatch

| Context | Agent caption | User transcript | Position |
|---------|---------------|-----------------|----------|
| Council meeting (`TextOutput`) | 18px / **25px** | — | absolute bottom in Council column |
| Current `RealtimeCaptionOverlay` | 18px / **20px** | 15px / 18px | `fixed`, bottom 0 / 20px |

Meta agent and museum voice guide should match council subtitles. Web voice guide keeps
compact sizes but needs more bottom clearance when the visualizer row is reserved.

---

## Button store — current model and target model

### What exists today

| Field | Meaning today |
|-------|----------------|
| `keyboardDown` / `hardwareDown` | **New** internal physical flags (on store, not on `useButton`). |
| `pressed` | Routed press — gated by `ledMode !== "off"`. |
| `buttonInputEnabled` | **To be removed.** |
| `rawPressed` | **To be removed** — redundant OR; encouraged bypassing LED gate. |
| `ledMode` | Applied LED for current `buttonOwner` (`off` \| `pulse` \| `on`). |
| `buttonOwner` | Highest-priority claimant. |

`useButton(owner)` exposes `pressed`, `claim`, `release`, `setLed` only.

### Why `buttonInputEnabled` is being dropped

It duplicated `ledMode !== "off"` in practice: features already express “accepting input”
via LED (`pulse` / `on` = ready, `off` = not accepting). The stored flag also got
incorrectly tied to bridge connection status, which broke keyboard PTT in museum mode.

**Decision:** delete `buttonInputEnabled`. Gate `pressed` inline with `ledMode !== "off"`.

### Target model (decided)

Internal physical inputs (store state, **not** on `useButton` API):

```text
keyboardDown   // Space held (PTT on, not typing in a field)
hardwareDown   // hardware button_down from bridge
```

Routed press (no separate `rawPressed` field — OR is inline in `recomputePressed`):

```text
pressed = (ledMode !== "off") && (keyboardDown || hardwareDown)
```

Per-consumer API (unchanged):

```text
useButton(owner).pressed = (buttonOwner === owner) && pressed
```

**`rawPressed` is dropped** — it was a redundant OR of the two physical flags and encouraged
consumers to bypass LED gating (`HumanInput` workaround). Product code uses **only
`pressed`**. Tests and `__councilButtonStore` dev hook may read `keyboardDown` /
`hardwareDown` when asserting physical-layer behaviour; e2e hardware tests assert
`pressed` (with LED not `off`).

```text
useButton(owner).pressed = (buttonOwner === owner) && pressed
```

**LED is the input gate.** Setting LED to `off` turns off button input — e.g. while
connecting, during error states, or when no feature is listening. `pulse` and `on` both
accept PTT. This replaces the old `buttonInputEnabled` concept; no separate stored flag
needed.

**Claim priority** is unchanged: only the winning owner’s `useButton(...).pressed` is true.
Consumers never branch on keyboard vs hardware.

### `recomputePressed()` (internal)

Single sync function called from keyboard handlers, hardware line handlers, LED changes,
and hardware disconnect paths:

```ts
function recomputePressed() {
  const pressed = ledMode !== "off" && (keyboardDown || hardwareDown);
  // set state + log on pressed edge changes
}
```

### Bridge / serial disconnect behaviour

Bridge lifecycle must **not** affect keyboard routing or LED gating.

On bridge `disconnected` / `error` or USB serial disconnect:

- Set `hardwareDown = false` (drop stale hardware hold).
- Leave `keyboardDown` untouched (Space may still be held).
- Call `recomputePressed()`.
- Do **not** touch `ledMode`, claims, or `buttonOwner`.

### LED transitions

On `applyLedMode` when LED changes from `off` → `pulse` / `on`:

- If `keyboardDown || hardwareDown` is already true, `pressed` becomes true immediately
  (visitor was holding Space or button before the feature became ready).

On LED → `off`:

- `pressed` becomes false regardless of physical holds.

### HumanInput

Remove `rawPressed` usage — **only `pressed`** after Phase 1.

### Setup page

Setup uses `useButton("setup")` for LED preview (`pressed` only) and bridge health via
`useButtonConnection` / `useButtonBridgeHealth`. No `rawPressed` exposure needed.

---

## Phase 1 — Fix `pressed` calculation (button store)

**Scope:** `client/src/museum/button/buttonStore.ts`, tests, e2e snapshot updates.
No voice-guide / meta-agent consumer changes if `useButton(...).pressed` is fixed at
the source.

**Status:** Design decided — ready to implement.

### Changes

1. **Drop `buttonInputEnabled`**
   - Remove field from store type, initial state, `dispose`, test reset, and e2e snapshot.
   - No computed alias — inline `ledMode !== "off"` where gating is needed.

2. **Split physical inputs; drop `rawPressed`**
   - Add `keyboardDown` and `hardwareDown` on store state (not on `useButton` API).
   - Remove `rawPressed` from store, `useButton`, tests, and e2e snapshots.
   - Keyboard handlers set/clear `keyboardDown` only.
   - Bridge `button_down` / `button_up` set/clear `hardwareDown` only.

3. **`recomputePressed()`**
   - `pressed = ledMode !== "off" && (keyboardDown || hardwareDown)`.
   - Call from: keyboard up/down, hardware up/down, `applyLedMode`, bridge/serial disconnect.
   - Fold existing `setPressed` logging into this (log source: keyboard vs button on edges).

4. **Decouple bridge from input gating**
   - Bridge `disconnected` / `error`: clear `hardwareDown` only, then `recomputePressed()`.
   - USB serial disconnect: same.
   - Never clear `keyboardDown` on bridge events.
   - Never touch `ledMode` or claims on bridge events.

5. **`applyLedMode`**
   - Remove `buttonInputEnabled` reads/writes.
   - After setting `ledMode`, call `recomputePressed()` (picks up held Space when LED goes `pulse`).

6. **Remove `rawPressed` from public surface**
   - Drop from `useButton` return type and all product components.
   - HumanInput: `pressed` only.
   - E2e / bridge tests: assert `pressed` for routed behaviour; assert `hardwareDown` only
     where physical sync is under test (no `rawPressed`).

### Tests

| Test | Expectation |
|------|-------------|
| Bridge disconnect + keyboard | `human-input` claimed, LED `pulse`, bridge disconnects, Space down → `keyboardDown` true, `pressed` true. |
| Bridge disconnect clears hardware only | `hardwareDown` true, serial disconnect → `hardwareDown` false; `keyboardDown` unchanged if held. |
| LED off blocks input | LED `off`, Space down → `keyboardDown` true, `pressed` false. LED `pulse` + held Space → `pressed` true. |
| LED transition | Space held before LED `pulse` → on transition to `pulse`, `pressed` becomes true. |
| Hardware OR keyboard | Either `keyboardDown` or `hardwareDown` alone; `pressed` when LED not `off`. |
| E2e `button_setup.spec.ts` | Drop `rawPressed` from snapshot; wait on `ledMode !== "off"`; assert `pressed` on simulate. |
| `MeetingVoiceGuide.ptt.test.tsx` | Pass unchanged. |

### Out of scope for Phase 1

- No `rawPressed` in `MeetingVoiceGuide` or `MeetingMetaAgent`.
- No visualizer or subtitle layout changes.

---

## Phase 2 — Expose mic stream from realtime session

**Scope:** `useRealtimeVoiceSession.ts`, thin pass-through in `useVoiceGuide.ts` and
`useMetaAgent.ts`.

### Changes

- Add `micStream: MediaStream | null` to session hook return value.
- In `setMicEnabled(open)`: when open, expose `connectionRef.current?.micStream`; when
  closed, set `null` (state update so overlay re-renders).
- No UI changes yet.

### Tests

- `useRealtimeVoiceSession.test.ts`: `setMicEnabled(true)` exposes stream; `false` clears it.

---

## Phase 3 — `RealtimeCaptionOverlay` layout, visualizer & subtitle variants

**Scope:** `client/src/realtime/RealtimeCaptionOverlay.tsx` (main UI work). Reuse
`LiveAudioVisualizerPair` from `@council/humanInput/LiveAudioVisualizer` — no new module.

### New props

```ts
micStream?: MediaStream | null;
micActive?: boolean;           // PTT held and mic track open
subtitleLayout?: "council" | "compact";
```

- **`council`** — meta agent, museum voice guide: match `TextOutput` (agent 18px / 25px;
  user transcript smaller above, ~15px / 18px at 0.85 opacity).
- **`compact`** — web voice guide: keep current sizes (agent 18px / 20px; user 15px / 18px).

### Layout (copy HumanInput flex pattern)

```text
┌─ fixed bottom column (centered) ─────────────┐
│  [user transcript — smaller, if present]      │
│  [agent caption — primary size]               │
│  ┌─ viz row (always reserved height) ──────┐ │
│  │ [left host] [center spacer] [right host]│ │  ← visibility:hidden when !micActive
│  │ LiveAudioVisualizerPair when micActive  │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
[Marquee PTT hint — unchanged, bottom-ui-banner-anchor]
```

- Viz row **always** occupies space (~56px slot matching HumanInput) with
  `visibility: hidden` when not active — subtitles must not jump when PTT starts/stops.
- Viz params match HumanInput: `width={100} height={40} barWidth={3} gap={2}`
  `barColor="#ffffff"`.

### Position

| Layout | Bottom offset | Max width |
|--------|---------------|-----------|
| `council` | Align with council subtitles: 0 mobile / 20px desktop | 70% |
| `compact` + PTT | Bump bottom by viz row height (~56–64px) to clear viz and web AI toggle | 70% / 92% mobile |

### Tests

- `RealtimeCaptionOverlay.test.tsx`: viz slot present in DOM; hidden when `micActive=false`;
  subtitle size classes / styles per layout; user line above agent line.

---

## Phase 4 — Wire callers

| File | Changes |
|------|---------|
| `MeetingMetaAgent.tsx` | Pass `micStream`, `micActive={button.pressed}`, `subtitleLayout="council"`. Still only `pressed` from `useButton`. |
| `VoiceGuideOverlay.tsx` | Accept `micStream`, `micActive`; pass `subtitleLayout={isMuseumMode ? "council" : "compact"}`. |
| `MeetingVoiceGuide.tsx` | Pass `micStream` and `micActive={pressed && pushToTalkMode && !muted}` from voice session to overlay. |

No changes to PTT mic gating logic beyond what Phase 1 fixes in the store.

---

## Phase 5 — Integration tests & manual checklist

### Automated

- Phase 1 button store tests (see above).
- Phase 2 session mic stream test.
- Phase 3 overlay layout tests.
- `MeetingMetaAgent.test.tsx`: overlay receives viz props when active + pressed.

### Manual regression

- [ ] Web + PTT: Space → voice guide hears visitor; visualizer appears; compact subtitles shifted up.
- [ ] PTT, hardware off: Space → voice guide and meta agent work; no bridge connection.
- [ ] PTT + hardware on, bridge connected: physical button works; LED follows owner (web or museum).
- [ ] Council meeting: meta agent activate (Space or hardware) → council subtitles hidden; agent captions council-sized; user transcript smaller above.
- [ ] Human input phase: button priority still routes to `human-input` over `meta-agent`.
- [ ] Setup `#setup`: bridge status when hardware on; LED preview on staff press.

---

## Implementation order

```text
Phase 1  button store — fix pressed (blocking museum keyboard)
Phase 2  micStream exposure
Phase 3  RealtimeCaptionOverlay layout + viz + subtitle variants
Phase 4  wire voice guide + meta agent
Phase 5  tests + manual pass
```

Phases 2–4 can be one PR after Phase 1 lands, or Phase 1 can ship alone as a bugfix.

---

## Files touched (expected)

| Phase | Files |
|-------|--------|
| 1 | `buttonStore.ts`, `useButton.ts`, `HumanInput.tsx`, `buttonStore.test.ts`, bridge tests, `button_setup.spec.ts`, test mocks |
| 2 | `useRealtimeVoiceSession.ts`, `useVoiceGuide.ts`, `useMetaAgent.ts`, session tests |
| 3 | `RealtimeCaptionOverlay.tsx`, overlay tests |
| 4 | `MeetingMetaAgent.tsx`, `VoiceGuideOverlay.tsx`, `MeetingVoiceGuide.tsx` |
| 5 | meta agent tests, manual checklist |

**Deliberately not adding:** `bottomUiLayout.ts`, `PttRecordingVisualizer.tsx`, or other
small modules unless a concrete duplication problem appears during implementation.

---

## Decisions log

| Topic | Decision |
|-------|----------|
| `buttonInputEnabled` | **Drop** — gate with `ledMode !== "off"` inline. |
| Physical inputs | **Split** `keyboardDown` / `hardwareDown`; **drop** `rawPressed`. |
| `pressed` formula | `(ledMode !== "off") && (keyboardDown \|\| hardwareDown)` |
| `useButton` API | **`pressed` only** — no `rawPressed`. |
| Voice guide / meta agent | **Only `pressed`**. |
| HumanInput | **`pressed` only** — remove `rawPressed` workaround. |
| E2e snapshot | Drop `buttonInputEnabled` and `rawPressed`; wait on LED not `off`; assert `pressed`. |

## Open questions (remaining)

1. **Compact layout bottom offset** (Phase 3): exact px after viz row — tune visually once viz is in place.
