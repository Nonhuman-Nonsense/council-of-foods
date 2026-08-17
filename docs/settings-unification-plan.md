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
  unattended: boolean;            // nobody present to fix a failure
  browserUi: boolean;             // visitor has their own browser, pointer, keyboard
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
| `unattended` | ✗ | ✓ |
| `browserUi` | ✓ | ✗ |
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

### Follow-up pass (after step 1)

- **`MuseumButton` split three ways.** It was a keyboard binding, a hardware bridge and a debug
  overlay in one always-mounted component. Now: the keyboard binding is a three-line effect
  inlined in `Main` (it is global, idempotent and unconditional — a wrapper hook would only be a
  file to go and find), `HardwareButton` holds the bridge and mounts under `pttHardwareEnabled`,
  and the LED overlay renders from `Main` under its own flag. Named `HardwareButton` rather than
  `ButtonBridge` to avoid a case-only clash with `buttonBridge.ts`.
- **`unattended` added**, replacing `isMuseumMode` at the seven self-recovery sites and as the
  parameter name through `useRealtimeVoiceSession` / `classifyRealtimeError` — a generic realtime
  layer had no business knowing about museums.
- **`browserUi` added** for the ten chrome sites (navbar, hamburger, fullscreen, landing copy,
  next buttons, add-human button, overlay close X, PDF download, conversation controls, the setup
  agent's volume corner and mic button).
- **Left on `isMuseumMode` deliberately:** the human-panelist rules in `SelectCharacters` and
  `meetingSetup.ts` (what a kiosk meeting *is*, not switchable behaviour), `navigation.ts`
  (kiosk app-root paths and the health probe), `MuseumSwitchButton`, and the prompt's museum
  framing.
- **`AutoplayCoordinator` cleaned up:** eighteen internal `isMuseumMode` guards deleted — it only
  ever mounts under `capabilities.autoplay`, so every one was dead.

## 8. Step 3 — button store gesture + web arming

**Gesture semantics changed from the original §3 sketch.** Discord's "hold vs. tap by
duration alone" turned out wrong for a shared kiosk: latching is `capabilities.latchOnTap`
(web only). Museum stays **strictly hold** regardless of duration — a latched-open mic on an
unattended kiosk has no keyboard to clear it and no on-screen button to reveal it, so a tap
there is just a short hold. Full rule:

| Gesture | web (`latchOnTap`) | museum |
|---|---|---|
| Hold (≥ 250ms) | momentary — opens on press, closes on release | momentary |
| Tap (< 250ms) | **toggles a latch** — stays open until the next tap | momentary (duration ignored) |
| Hold while latched on | **forces the latch closed** — an explicit "close" gesture | n/a |

`pressed` stays purely physical (needed by edge-triggered consumers — autoplay dismiss/exit,
summary restart, replay restart — which would misfire if a tap froze them at `true`). The new
`ButtonHandle.wantsMic` (`pressed || latched`) is what the three mic consumers (setup agent,
human input, meta agent) read instead, and is also what drives the derived LED. `pressed === wantsMic` in museum by construction, so
nothing there changes behaviourally.

Naming lived through a few passes: `talkOpen` (rejected — vague), `userHasSpoken` (rejected —
collides with the *has-ever-spoken* concept from §4, a different thing), landing on
`wantsMic` — it reads correctly both standalone (`button.wantsMic`) and as the value already
being passed into `micOpen:` params at all three call sites.

**The tap decision, and where it lives:** `buttonStore.ts` tracks `pressStartedAt` as a plain
module variable (not reactive state — nothing renders off it) and decides tap vs. hold only on
a *genuine* press→release edge inside `recomputePressed`, i.e. only when `pressed` itself
transitions — not on every store update. That excludes suppressed input during an
owner-handoff (`ignoreDownUntilRelease`), which never makes `pressed` true, so it never reaches
the decision at all. `latched` is cleared unconditionally on disarm (`arm("off")`) and on owner
change, both *before* `recomputePressed` runs so it sees `pressStartedAt == null` and leaves
the forced value alone — otherwise a disarm mid-press (e.g. the visitor gets muted while
holding) could read as a fast release and incorrectly latch the mic on.

**`setLed(mode)` → `setArmed(boolean)`, and the LED became derived.** The first pass renamed
`setLed` to `arm` while keeping the LED-mode enum, but `arm("pulse")` still leaked light
vocabulary into every caller and `arm(false)` would have read as a contradiction. The store now
holds an explicit `armed` boolean — the gate `recomputePressed` actually tests — and computes
`ledMode` purely for display via `resolveLedMode(armed, wantsMic)`: dark when disarmed, solid
while the mic is open, pulsing otherwise. Owners never mention lights, and a web owner needs no
light to exist. This also finishes untangling the gate/display conflation step 3 deliberately
left in place, without adding the second API call that made a split unattractive.

Three owners lost a `useMemo` entirely (`autoplay`, `summary`, `replay` pass a constant
`true`; `staff` too, since its `pressed ? "on" : "pulse"` is now automatic), and the other
three collapsed to a plain boolean: `!muted && !agent.isConnecting` (setup agent),
`connectionState === "ready"` (meta agent), `state === "ready" || state === "recording"`
(human input).

Two deliberate, sub-second behaviour changes fall out of deriving the LED from `wantsMic`:
human input's LED now goes solid on press rather than when `connectionState` reaches
`"recording"` a beat later, and the meta agent's goes solid on a standby press rather than
waiting for the phase flip that same press triggers. Both were judged improvements; the
alternative was keeping a three-value enum purely to express them.

**Web arming, scoped to the setup agent only.** `MeetingSetupAgent` now claims/arms the button
in both modes — that's what makes `wantsMic` live at all in web — with its LED `useMemo` and
`micOpen`/`micActive` reads moved from `button.pressed` to `button.wantsMic`. This is
functionally inert today: `useSetupAgent`'s mic-gating effect only fires when
`capabilities.micUpFront` is true, which web never is, so `wantsMic` toggling in web currently
does nothing downstream — that's deliberate, it's step 4's job to plug the mic hybrid in behind
it. `HumanInput`'s button claim stays `isMuseumMode`-only; that widening is step 5.

**Tests:** pinned `buttonStore.test.ts`/`useButton.test.ts`/`buttonIntentIntegration.test.tsx`
to `councilAppMode=museum` — those suites are about ownership/transport mechanics and default
to `latchOnTap: true` (web) when unset, which would otherwise read every synchronous
press-then-release in those tests as a tap. Added a dedicated tap/hold `describe` block in
`buttonStore.test.ts` covering both modes plus the disarm/owner-change clears. Six mocked
`useButton` consumers (autoplay, HumanInput, Staff, Summary, MeetingSetupAgent ×2,
MeetingMetaAgent) needed `setLed` → `arm` and a `wantsMic` field added to their mocks.


## 9. Step 4 — mic hybrid, the latch as single source, prompt

**No detaching at all.** The plan's step-3 hybrid ended with "detach on latch-off or after an
idle timeout"; that was dropped. Once the visitor has handed the mic over they are likely to use
it again, and `close()` already stops every track — so the browser's recording indicator goes
out when the session is torn down (mute, meeting start, unmount) with no bookkeeping of ours.
The mic is acquired once and then only `enabled`-gated, so no press after the first pays for
`getUserMedia`. `session.micStream` cannot answer "is it attached?" (`setMicEnabled(false)`
nulls it to stop the visualiser), so attachment is tracked in a ref, reset whenever the session
drops since a reconnect brings a fresh peer connection.

**One source of truth for the mic.** The on-screen mic button is the same gesture as a tap by
another input device, so it calls `button.toggleLatch()` rather than keeping its own state;
`micOn`/`toggleMic` are gone from `useSetupAgent`, which now just receives `micOpen`.
`wantsMic` additionally requires `armed`, because a click can set the latch before the agent
has armed the button and a disarmed button must want nothing.

**The agent is told once.** `canHearVisitor` is deleted; only the `hasEverHeardVisitor` latch
remains, and `MIC_ON_MESSAGE`/`MIC_OFF_MESSAGE` collapse into a single
`VISITOR_AUDIBLE_MESSAGE` sent the first time the visitor becomes audible mid-session. This is
not optional politeness: `instructions` are only read at connect, so without it an agent that
opened mic-less would keep its "they cannot speak, comment only, tools will refuse" rules for
the rest of the session no matter what it then heard. `reconfigureSession()` would push new
instructions but resets the turn machinery and can drop a queued click reaction.

**Two bugs found while wiring it:**

- `useAgentPresence` chose its nudge and welcome-back copy from `canHearVisitor` — "do not ask
  them anything" whenever the mic was shut. Under push-to-talk that is *most of the time*, so a
  visitor mid-conversation would have been treated as unable to answer. It reads
  `hasEverHeardVisitor` now.
- The effect marking a mic-open as the visitor's own request was declared *after* the attach
  effect. Effects run in declaration order, so the first real request attached with
  `userInitiated: false` and a denied permission would have failed silently instead of showing
  the blocked overlay. Moved above, with a comment saying why the order matters.

**Cold start.** Any mic gesture — space, tap, or button — now sets `startedByVisitor`, so a
press on a page still waiting for an autoplay gesture starts the agent. Previously only the
mic button did, which would have left space inert on a cold page.

**Window blur clears a held key.** The first web press opens the permission prompt, which can
take focus and swallow the `keyup`, leaving the mic open with nothing holding it. Losing focus
now counts as a release (and fixes alt-tab-while-holding too).

**Prompt.** The web "Visitor Microphone" section collapses from a four-way state machine to the
single latch, tells the agent that a shut mic is normal and not worth remarking on, mentions
both the space bar and the mic button in the one-time invitation, and tells it to drop the
silent-visitor rules if it is later told the visitor can talk.


## 10. Step 5 — space in the meeting

Web already had voice input here: `handleStartStopRecording` is click-to-start / click-to-stop,
i.e. already a latch. So step 5 was not "add voice to web" but "make space a second way to drive
the same thing", and the level-triggered release effect (`!wantsMic && recording → finish`) would
have killed any take started by a click. Both routes now go through the latch, exactly as the
setup agent's mic button does — `handleStartStopRecording` calls `toggleLatch()` and the effects
do the recording, so there is one gesture source and no second copy of the state.

- **Claim in both modes**, `phase === "active"`; arming already keyed off `canRecord`.
- **Both PTT effects read `wantsMic`** instead of `pressed` and lose their `isMuseumMode` guard.
  Museum is untouched: `wantsMic === pressed` where latching is off.
- **Auto-submit** stays behind `capabilities.autoSubmitHumanInput`, and the release effect only
  *queues* one where that holds — web leaves the transcript in the textarea to edit and send.
- **`pttSessionActive` moved to `capabilities.unattended`.** It gates the banner and the 20s
  idle `onAbandonHumanTurn`; that second one exists because a kiosk visitor can walk away
  mid-turn with nobody to recover it, which is unattendedness, not museum-ness.

**A real bug this surfaced.** Relying on "disarming clears the latch" is not enough here. The
no-speech path runs `recording → finishing → ready` inside a single React batch, so `canRecord`
never changes, `setArmed(false)` never fires, and a latch left on re-opens the mic the instant
the state lands back on `ready` — focusing the textarea would have stopped and immediately
restarted recording.

The first fix was to clear the latch inside `finishRealtimeSession()`, defended as "then no
caller can forget it" — which is the tell for a hidden coupling. It made the dependency
bidirectional: the gesture drives the session, and the session reaches back into the gesture.

The real fix is that neither non-gesture caller wanted to *end a session* at all. Focusing the
textarea means "I'll type instead"; hitting the length cap means "there is no room for more
speech". Both are **the visitor withdrawing the ask**, so both now clear the latch and let the
existing release effect do the finishing. `finishRealtimeSession()` has exactly one caller, no
button dependency, and the flow is one-directional again: gesture → `wantsMic` → session.
`clearButtonLatch` / `clearLatch` stays as the one way an owner ends a latch it did not start.

`clearLatch()` is a no-op wherever latching is off, which is the whole of museum: `latchOnTap`
is false there, so `latched` is never set, and every `toggleLatch()` call site sits behind a
control that only renders in web. So the length-cap path changes only in whether it *interrupts*
a take. It used to call `finishRealtimeSession()` outright — muting the mic, disarming on
`canRecord`, then re-arming and restarting under a still-held button, losing about a second of
speech in the gap. Now it banks the text and leaves ending the take to the gesture: a latch is
cleared, a held button simply carries on to its own release. Either way the transcript is frozen
at the cap (`formatTranscriptInputValue` truncates), so the outcome is identical and the
connection is no longer churned for nothing. `MAX_INPUT_LENGTH` is 10,000 characters — roughly
half an hour of unbroken speech — so this path is close to unreachable regardless.

**Space and the textarea.** The store's `isTypingTarget` guard means space types a space while
the textarea has focus and only acts as push-to-talk when focus is elsewhere. Nothing autofocuses
it, so a fresh turn starts with space working; after typing, the visitor clicks away to use it
again. That pairs with the existing "focusing the textarea ends the take" behaviour.

**Test mocks had to grow up.** `HumanInput`'s `useButton` mock was static, and modelling the real
store exposed two things worth keeping: `claim` must set `buttonOwner` (a latch belongs to an
owner), and the handle's functions must be identity-stable as the real `useCallback`s are —
fresh identities each render made the claim effect release and re-claim continuously, wiping the
latch every time.
