# Settings unification — one mode, derived capabilities

Collapses the two orthogonal settings (`installation: web|museum` × `agentMode: off|always-on|ptt`)
into a single **web | museum** switch, and replaces the scattered `isMuseumMode && agentMode === "ptt"`
conditionals with one derived capability table. Web gains spacebar push-to-talk alongside its
mic button; museum keeps today's behaviour exactly.

**Status:** Plan — no code yet.

**Related:** [web-agent-voice-ux-plan.md](./web-agent-voice-ux-plan.md) (the web mic button this
builds on), [MUSEUM.md](../MUSEUM.md), [RESILIENCE.md](../RESILIENCE.md).

---

## 1. Why `agentMode` has to go

`agentMode` is one setting doing three unrelated jobs:

| Job | Where |
|---|---|
| Does the setup agent mount at all | `MeetingSetupShell.tsx:134` (`!== "off"`) |
| How the mic is gated | `useSetupAgent.ts:120` (`pttMic`), `setMicEnabled(micOpen)` |
| **Is the button system armed** | everywhere below |

That third job is the problem. `agentMode === "ptt"` currently gates the spacebar handler
(`buttonStore.ts:210`, `:220`), the hardware bridge (`Main.tsx:211`), in-meeting dictation
(`HumanInput.tsx:349–458`), the meta agent (`Council.tsx:259`, `useCouncilMachine.ts:91`, `:511`),
the summary teleprompter (`Summary.tsx:66`), and the staff hardware/LED rows (`Staff.tsx:360–362`).

Several of those are historical accidents — the teleprompter is gated on `isMuseumMode && ptt`
where museum implied ptt anyway. Each site gets an explicit capability instead.

## 2. The settings model

**Stored** (localStorage): `appMode: "web" | "museum"`, plus two independent staff overrides —
`pttHardwareEnabled`, `ledDebugOverlay` — and the existing dev-log settings.

**Derived** (pure function, never persisted):

```ts
// settings/capabilities.ts
export type Capabilities = {
  metaAgent: boolean;             // meeting-time agent
  teleprompter: boolean;          // summary scroll mode
  autoSubmitHumanInput: boolean;  // PTT release auto-sends the transcript
  autoplay: boolean;
  cursorHide: boolean;
  micUpFront: boolean;            // vs deferred + attach on demand
  micToggleButton: boolean;       // bottom-centre control
  latchOnTap: boolean;            // tap toggles; otherwise hold is the only gesture
};

export function capabilitiesFor(mode: AppMode): Capabilities;
```

| Capability | web | museum |
|---|---|---|
| `metaAgent` | ✗ | ✓ |
| `teleprompter` | ✗ | ✓ |
| `autoSubmitHumanInput` | ✗ | ✓ |
| `autoplay` | ✗ | ✓ |
| `cursorHide` | ✗ | ✓ |
| `micUpFront` | ✗ | ✓ |
| `micToggleButton` | ✓ | ✗ |
| `latchOnTap` | ✓ | ✗ |

Push-to-talk is **not** a capability — it is on in both modes now. Space works everywhere;
the hardware button additionally requires `pttHardwareEnabled`.

**Why derived and not stored booleans:** persisted per-capability flags drift out of step with the
mode (flip to museum, flip back, keep whatever the last write left), so every install becomes a
snowflake and "what does web mode do?" stops having an answer you can read off the code. Deriving
gets the same decoupling — call sites read `caps.teleprompter`, not `isMuseumMode && ptt` — with
one readable table as the spec and no second source of truth.

## 3. Push-to-talk: the Discord rule (web only)

**Hold is the base gesture in both modes** — mic opens on press, closes on release. Web adds
latching on top (`caps.latchOnTap`); the same rule then applies in setup and in human turns.

| Gesture | web | museum |
|---|---|---|
| Hold (> ~250 ms) | momentary — closes on release | momentary — closes on release |
| Tap (< ~250 ms) | **latches** — stays on until the next tap | just a short momentary press |

Museum stays strictly hold: on an unattended kiosk a latched-open mic has no keyboard to clear it
and no on-screen button to reveal it, so the visitor's only exit is a gesture they were never
taught. Web has both, which is what makes latching safe there.

The on-screen mic button is a *display* of `micOn`, not separate state: visualiser shows when the
mic is on, hides when it is off. Everything follows from the one boolean.

### Mic acquisition — the hybrid

Web must not prompt for permission or light the browser recording indicator until the visitor asks.
So:

1. **First** space press (or mic-button tap) → `attachMic({ userInitiated: true })`. Permission
   prompt happens here; costs a fraction of a second, once.
2. **Between** presses → `setMicEnabled(false)` — track stays attached, `track.enabled = false`.
   Subsequent presses are instant.
3. **Detach** (`detachMic()`, stops the tracks so the recording indicator clears) when the visitor
   latches the mic off, or after an idle timeout.

Museum is unchanged: `micUpFront`, acquired at connect, gated by `setMicEnabled`.

A denied permission keeps today's behaviour — blocked overlay, flow continues by hand.

## 4. The agent no longer tracks the microphone

`canHearVisitor` disappears; only the `hasEverHeardVisitor` latch remains.

This removes `MIC_ON_MESSAGE` / `MIC_OFF_MESSAGE` and the effect that narrates mic changes into the
conversation (`useSetupAgent.ts:222–236`) — which momentary PTT would otherwise flood. Instructions
stop depending on live mic state, so the builder-callback in `MeetingSetupAgent.tsx:92` can collapse
back to a plain value.

The behaviour it bought is preserved by the latch: a visitor who has never spoken is driving the
page by hand, so the agent comments rather than asking questions, and the tool guard
(`useSetupAgent.ts:158`, already keyed on `hasEverHeardVisitor`) keeps refusing UI-moving tools.
Once they have spoken, the agent may converse freely.

**Prompt wording** (`setupAgentPromptEn.ts:16`): museum keeps "use the talk button"; web says
"press the button below, or use the space bar".

## 5. Work by area

**Settings** — `settings/councilSettings.ts`: delete `AgentMode`, `getAgentMode`/`setAgentMode`,
the storage key, the change event, and the `setAppMode` coupling that forced `always-on`. Drop the
force-clear of `pttHardwareEnabled` (it is independent now, and usable in web for testing a button
on a laptop). Add `settings/capabilities.ts`. Read-and-discard the stale `councilAgentMode` key.

**Button store** — `buttonStore.ts:210`, `:220`: replace the `getAgentMode() !== "ptt"` gate so
space is live in both modes. Note `pressed` also requires `ledMode !== "off"` (`:139`) — the LED
doubles as the arming gate, so the web setup agent must still `claim()` and set a mode even with no
physical LED. Add the tap/hold discrimination here, where press and release already live, behind
`caps.latchOnTap` so museum keeps raw press/release with no timer in the path.

**Setup agent** — `useSetupAgent.ts`: `pttMic`/`deferMic` from `caps.micUpFront`; implement the
three-step mic hybrid; delete `canHearVisitor` and the announcement effect. `MeetingSetupAgent.tsx`:
claim the button in both modes; LED effects stay museum-only. `SetupAgentOverlay.tsx`: `showMicRow`
in both modes, `micActive` from the single `micOn`.

**Meeting** — `Council.tsx:259` + `useCouncilMachine.ts:91`, `:511` → `caps.metaAgent`.
`Summary.tsx:66` → `caps.teleprompter`. `HumanInput.tsx`: space drives the mic in both modes
(same tap/hold rule); auto-submit behind `caps.autoSubmitHumanInput`, so web lands the transcript in
the textarea for the visitor to send. `Main.tsx:211` → `pttHardwareEnabled`; `:262` fullscreen
suppression → `ledDebugOverlay`.

**Staff** — left panel becomes two rows: `web | museum`, then `switch | hardware | LED`. Delete the
agent-mode panel and the `showPttOptionsRow` / `showLedPreviewPill` gating; the button status panel
follows `pttHardwareEnabled` alone.

**Banner copy** — `useButtonBanner` in setup is keyed on `ptt && !muted` with museum-worded marquee
text; web needs its own copy or none.

**i18n** — remove `agentMode.*`, `staff.panels.agentMode`; add the new staff labels and the web
prompt hint, in both `translation_en.json` and the Swedish file.

**Docs** — `MUSEUM.md` and `web-agent-voice-ux-plan.md` describe the three-mode model.

## 6. Tests

Per [TESTING.md](../TESTING.md), the behaviours worth covering at module boundaries:

- `capabilitiesFor` — table-driven, both modes (cheap, and it is the spec).
- Button store gestures, table-driven over both modes: hold opens and closes on release everywhere;
  in web a tap latches and a second tap unlatches; in museum a tap is momentary and never latches.
- Mic hybrid: first press attaches once; subsequent presses toggle `enabled` without re-attaching;
  latch-off detaches.
- `hasEverHeardVisitor` latch still gates tools after the mic goes off.
- Web meeting: space opens the mic, release does **not** auto-submit; museum still does.

Existing files that reference `agentMode` and need updating: `Staff.test`, `useSetupAgent.test`,
`MeetingSetupAgent.ptt.test`, `MeetingSetupAgent.reactions.test`, `SetupAgentOverlay.test`,
`setupAgentTools.test`, `councilSettings.test`, `museumButton.test`, `Council.test`,
`CouncilOverlays.test`, `Summary.test`, `HumanInput.render.test`, `Main.test`,
`metaAgentPrompt.test`, `Landing.test`, `SelectTopic.test`, `useCouncilMachine.test`, and
`tests/e2e/src/button_setup.spec.ts`.

## 7. Suggested order

1. ✅ `capabilities.ts` + settings cleanup, with call sites moved mechanically to `caps.*` — no
   behaviour change yet beyond web/museum defaults.
2. ✅ Staff page relayout (landed with step 1 — removing `agentMode` forced it).
3. Button store tap/hold + web arming.
4. Setup agent mic hybrid + `canHearVisitor` removal + prompt wording.
5. HumanInput space handling.
6. Docs and i18n.

Steps 1–2 are safely landable on their own; 3–5 are where the behaviour actually changes.

### Notes from step 1

- `MuseumButton` owned both the keyboard binding and the hardware bridge. Gating its mount on
  `pttHardwareEnabled` would have killed spacebar in web, so it now always mounts and only the
  bridge follows the hardware setting.
- `useSetupAgent` took `isMuseumMode` for six different reasons, three of them about the
  microphone. Those three (`deferMic`/`pttMic`, the `attachMic` guard, the `hasEverHeardVisitor`
  seed) now key off a `micUpFront` param; `isMuseumMode` keeps only the genuinely museum ones
  (retry policy, blocking connection-error overlay).
- Sites that were `agentMode === "ptt"` but *meant* museum — the setup agent's button claim and
  LED, and HumanInput's dictation — are mapped to `isMuseumMode` for now, preserving today's
  behaviour exactly. Steps 3 and 5 widen them to web.
- The prompt's talk-button line is museum-only until step 4; web says nothing about the space
  bar while the space bar does nothing.
