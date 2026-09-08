# Presenter mode

A third `AppMode` for performative screenings: the app looks like the museum
kiosk, but nothing drives itself on a timer, because a person is standing next
to it talking about what is on screen.

## Why it is not just "museum with autoplay off"

Museum's self-driving behaviour is spread across five independent idle timers,
only two of which were mode-gated, and `capabilities.unattended` bundled six
unrelated concerns. A presenter wants some of that bundle (self-healing) and
emphatically not the rest (anything that restarts or skips ahead on its own).

The five idle behaviours:

| Behaviour | Where | Was gated by |
|---|---|---|
| Autoplay: 90s idle → replay loop | `autoplayStore.SETUP_IDLE_MS` | `autoplay` |
| Summary → landing, 20s after the reading | `autoplayStore.SUMMARY_RETURN_TO_ROOT_MS` | `teleprompter` |
| Abandon an idle human turn | `HumanInput` `onIdleTerminal` | `unattended` |
| Setup agent nudge (10s) / teardown (3min) | `useAgentPresence` | *nothing — ran in web too* |
| Reconnect auto-reload / restart countdown | `Reconnecting`, `CouncilError` | `unattended` |

## Capability changes

`unattended` splits into three, and three more flags are added so that no code
branches on the mode itself (a new mode must never fall into the `web` branch of
a `=== "museum"` check by accident).

- `selfHealing` — infinite retry, blocking reconnect overlay, missing mic is
  fatal, auto-resume a meeting paused by an environmental interrupt.
- `autoRestart` — reload after prolonged disconnect, self-firing restart
  countdown on the error screen.
- `idleAbandonTurn` — skip a human turn nobody came back to.
- `idleNudge` — the setup agent's "are you still there?" and idle teardown.
- `autoReturnToLanding` — the 20s hop from summary back to `/`.
- `voiceOnlySetup` — panelist ordering, human panelists without typed
  descriptions, the visitor auto-added as `panelist0`, and the voice-only setup
  agent prompt and tool set.
- `kioskReload` — health-probe before reload, and reload to `APP_ROOT` in the
  default language rather than the current language root.

## The table

| Capability | web | museum | presenter |
|---|---|---|---|
| `selfHealing` | ✗ | ✓ | ✓ |
| `autoRestart` | ✗ | ✓ | ✗ |
| `idleAbandonTurn` | ✗ | ✓ | ✗ |
| `autoplay` | ✗ | ✓ | ✗ |
| `idleNudge` | ✓ | ✓ | ✗ |
| `autoReturnToLanding` | ✗ | ✓ | ✗ |
| `browserUi` | ✓ | ✗ | ✗ |
| `metaAgent` | ✗ | ✓ | ✓ |
| `teleprompter` | ✗ | ✓ | ✓ |
| `autoSubmitHumanInput` | ✗ | ✓ | ✓ |
| `cursorHide` | ✗ | ✓ | ✓ |
| `micUpFront` | ✗ | ✓ | ✓ |
| `micToggleButton` | ✓ | ✗ | ✗ |
| `latchOnTap` | ✓ | ✗ | ✗ |
| `voiceOnlySetup` | ✗ | ✓ | ✓ |
| `kioskReload` | ✗ | ✓ | ✓ |

Presenter is museum minus the four self-driving timers, and nothing else.

Decisions worth recording:

- **Auto-resume stays under `selfHealing`**, so presenter keeps it: there is no
  play/pause control in a kiosk-chrome UI, so a meeting paused by a tab switch
  would have no way back.
- **No latching in presenter.** A tap-latched mic that keeps hearing the
  presenter narrate is worse than holding the button.
- **The idle nudge stays on in web** for now — it predates this work and is not
  a presenter question.
- The hardware button and the LED preview remain independent stored settings, as
  before: they cut across all three modes.

## Escape hatch

`MuseumSwitchButton` (the invisible top-left staff target) toggles between web
and *the last non-web mode*, remembered in `localStorage`. It is not a three-way
cycle: the control exists to drop out to web and come back, not to browse modes.
It defaults to museum when nothing has been selected yet.

## Work

1. Widen `AppMode`; give `getAppMode()` a real parse with fallback.
2. New capability flags and the `PRESENTER` row; delete `unattended`.
3. Convert every raw `=== "museum"` / `isMuseumMode` check to a capability
   (`navigation`, `meetingSetup`, `SelectCharacters`, `setupAgentTools`,
   `setupAgentPrompt*`, `MeetingSetupAgent`, `Council`).
4. Gate `useAgentPresence` on `idleNudge`.
5. Split the summary auto-return out of `teleprompter`.
6. Staff page: three-way segmented control; escape hatch remembers the last
   non-web mode.
7. Tests: table-driven matrix over `capabilitiesFor`, and re-point existing
   museum-behaviour tests at capabilities rather than the mode.

Server side needs no changes — it has no notion of app mode.
