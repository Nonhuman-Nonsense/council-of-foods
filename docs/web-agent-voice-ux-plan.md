# Web-mode agent — listen-first voice UX + mic permission

Reshapes the setup agent for web: it runs from the start as a **commentator** with no
microphone and no permission prompt, and the visitor can hand it their voice with one click on
a mic button at the bottom centre of the screen. A denial never blocks the flow.

Supersedes the earlier mic-permission-only plan; that plan's mechanics (availability store,
`unavailable` classification, blocked overlay) survive intact — the trigger point moves.

**Status:** Plan — no code yet. The one technical unknown has been **spiked against the live
Inworld API and resolved**: option A works (§2).

**Related:** [agent-error-handling-plan.md](./agent-error-handling-plan.md),
[RESILIENCE.md](../RESILIENCE.md).

---

## 1. The shape of web mode

The agent has two jobs, and most web visitors will only want the second:

| Job | Needs mic? |
|---|---|
| Guide the setup by voice conversation | Yes |
| Comment on what the visitor clicks (topic, and now characters — `a3d32ab3`) | **No** |

So: **connect without a mic, comment freely, and treat the microphone as an opt-in.**

| | Before | After (web) |
|---|---|---|
| On load | Mic prompt, then agent | No prompt; agent connects mic-less and comments |
| Corner AI button (bottom-left) | Start/stop the whole agent | **Removed** |
| Mic control | none (mic always hot in always-on) | **Bottom-centre mic button**, toggle on/off |
| Mic active feedback | none in web | Live audio visualiser flanking the button, as museum shows on button press |
| Mic denied | Terminal error overlay | Blocked overlay on request; flow continues by hand |

Museum mode is untouched: PTT/always-on with a hardware button keeps today's behavior.

---

## 2. The hard question: can WebRTC connect without mic permission?

**Yes — connecting does not require permission.** `getUserMedia` is the only thing that
prompts; `RTCPeerConnection`, SDP exchange, DTLS and the data channel do not. What you cannot
do is *add a sending audio track later without renegotiating* — and our SDP exchange is a
one-shot `POST /api/realtime/call` proxy to Inworld with no renegotiation path
([realtimeProviders.ts:200](../server/src/api/realtimeProviders.ts#L200)). That constraint
shapes the options:

| Option | How | Cost if it works | Risk |
|---|---|---|---|
| **A. Empty sendrecv transceiver** *(recommended)* | `pc.addTransceiver("audio", { direction: "sendrecv" })` with **no track** at connect; on mic grant `transceiver.sender.replaceTrack(micTrack)`. `replaceTrack` never renegotiates. | Nothing — instant mic, one session | Does Inworld accept a sendrecv m-line that carries no RTP, and start accepting packets when they appear? Standard SFU behavior, unverified here |
| **B. Silent synthetic track** | Same, but attach a track from a Web Audio `MediaStreamDestination` (no source connected) so the m-line looks completely ordinary; `replaceTrack` swaps in the real mic later | Streams silence continuously — check whether Inworld bills input audio by the second | Lower: SDP is indistinguishable from a normal call. AudioContext may start suspended without a gesture (produces no packets — usually fine, occasionally the point of the exercise) |
| **C. Recvonly, reconnect on mic enable** | Connect `recvonly`; when the visitor clicks the mic, tear down and reconnect with a real mic track | ~1–2 s wait at the click (same as today's connect), and the session restarts | Lowest — no provider assumptions. The agent loses conversation history, though `buildSetupAgentPrompt` already rebuilds context from phase + selections, so it recovers well |

### Spike result — option A works (verified against live Inworld)

Headless Chromium against `api.inworld.ai` with the **real** setup-agent session fragment
(`getSetupAgentRealtimeBootstrap("en")`), a fake mic fed from a spoken WAV, and mode M (mic
attached up front, i.e. today's app) as the control:

| | M (control) | **A (empty sendrecv)** | B (silent track) |
|---|---|---|---|
| `POST /v1/realtime/calls` | 201 | **201** | 201 |
| Offer / answer audio direction | sendrecv / sendrecv | **sendrecv / sendrecv** | sendrecv / sendrecv |
| Data channel + `session.created` / `session.updated` | ✅ | **✅** | ✅ |
| Agent speaks (inbound audio bytes, before any mic) | ✅ | **✅ 5.7 KB** | ✅ 7.1 KB |
| Bytes / packets **sent** before the mic is attached | n/a | **0 / 0** | **0 / 0** |
| After `sender.replaceTrack(mic)` — no renegotiation | ✅ | **✅ +37.9 KB, 501 packets** | ✅ +37.8 KB, 500 packets |
| Inworld hears it: `speech_started` → `input_audio_transcription.completed` with the spoken sentence | ✅ | **✅** | ✅ |
| Connection state after the swap | connected | **connected** | connected |

So: **connect with no microphone, let the agent talk, then hand it the mic mid-session with
`replaceTrack` and no renegotiation.** Inworld accepts the empty sendrecv m-line and starts
transcribing the moment packets appear.

B also passed — and Chrome sent **zero** packets for the silent track too, so the billing worry
is moot either way. Since B needs an `AudioContext` (which starts suspended without a gesture)
for no measurable benefit, **option A is the choice**. C stays documented as a fallback only if
a future provider rejects the empty m-line.

Inworld's docs say nothing about SDP direction requirements, renegotiation, or silence billing
([Realtime WebRTC](https://docs.inworld.ai/api-reference/realtimeAPI/realtime/realtime-webrtc)) —
this table is the empirical answer. STT is billed by audio duration
([billing](https://docs.inworld.ai/portal/billing)), which is another point for "send nothing
until the visitor asks".

Changes in `createRealtimeConnection` either way: `micStream` becomes genuinely optional
(today the caller must supply one or it calls `acquireMicrophone` itself,
[realtimeConnection.ts:426](../client/src/realtime/realtimeConnection.ts#L426)), and the
returned connection must expose the audio sender so the hook can attach/detach a mic. `close()`
must stop whatever track is attached at that moment.

### The mic handoff

`useRealtimeVoiceSession` gets `attachMic()` / `detachMic()` in place of today's
`setMicEnabled` (which toggles `track.enabled` on an already-acquired stream):

- `attachMic()` → `acquireMicrophone()` (this is what prompts, from a click) →
  `sender.replaceTrack(track)` → expose `micStream` so the visualiser can run.
- `detachMic()` → `sender.replaceTrack(null)` → **stop the tracks**, so the browser's recording
  indicator goes away. Re-acquiring on the next click is instant and does not re-prompt.

Museum keeps passing a mic up front; `pttMic` semantics are unchanged.

---

## 3. Autoplay is now the real constraint

Removing the mic prompt from page load does **not** remove the browser's requirement for a
user gesture — it just moves the problem to the output side. Without a gesture:

- `el.play()` on the remote audio element is rejected on Safari and on Chrome without
  sufficient media engagement — the rejection is currently swallowed
  ([useRealtimeVoiceSession.ts:172](../client/src/realtime/useRealtimeVoiceSession.ts#L172)),
  so a silenced agent looks identical to a working one;
- the `AudioContext` behind `createRemoteAudioAnchor` starts *suspended*, and its `currentTime`
  is the subtitle playback clock — captions would sit still even if audio somehow played. It
  already tries `ctx.resume()` on arm ([remoteAudioAnchor.ts:156](../client/src/realtime/remoteAudioAnchor.ts#L156)),
  best-effort.

An agent whose entire web value is *speaking unprompted* cannot start before a gesture — unless
we have good reason to believe autoplay is already unlocked. Mic permission is that signal: a
visitor who has granted the mic has interacted with this origin before, which is exactly what
Chrome's media-engagement heuristic keys on. Hence the gate:

```
web, permission "granted"     → connect immediately, landing included
web, anything else            → connect when phase !== "landing"  (the "Let's go" click is the gesture)
museum                        → connect on mount                  (unchanged)
```

`phase` is already in `MeetingSetupAgent`, `"landing"` on `/` and `"topic"`/`"characters"` on
`/new` ([MeetingSetupShell.tsx:46](../client/src/newMeeting/MeetingSetupShell.tsx#L46)) — a
one-line condition, no plumbing, no change to `Landing.tsx`. First-time visitors get a silent,
purely manual landing page and meet the agent at topic selection, where its commentary has
something to comment on; returning visitors are greeted straight away.

Note what option A removes from this: the connect itself never touches `getUserMedia`, so the
permission state is only ever a *hint* here, and a `denied` visitor still gets the full
commentating agent. Permission only really matters at the mic button.

Regardless of option A/B/C, **add the `play()` rejection handler** — log it, and if it fires,
surface the same kind of one-click affordance ("tap for sound") rather than pretending to talk.

---

## 4. UI

### Mic button

Good news: the slot already exists. `RealtimeCaptionOverlay` renders a bottom-centre row with a
`record_voice_on` icon flanked by `LiveAudioVisualizerPair` hosts, currently inert
(`onClick: () => undefined`) and shown only for museum PTT
([RealtimeCaptionOverlay.tsx:135](../client/src/realtime/RealtimeCaptionOverlay.tsx#L135)). It
is deliberately sized to match `HumanInput`'s centre slot. The work is to make that slot
interactive and available in web:

| Prop | Today | After |
|---|---|---|
| `showPttVisualizer` | museum PTT only | rename to something mode-neutral; true for web too |
| centre icon | static `record_voice_on` | three states — see below |
| viz row visibility | `micActive` | unchanged — visible while the mic is on |

Result: the same visual language as museum-on-press and as `HumanInput`, in the same screen
position, which is exactly the consistency you're after. Captions sit above it as they do now.

The slot is **opt-in via prop**: `MeetingMetaAgent` renders the same component in museum
meetings ([MeetingMetaAgent.tsx:383](../client/src/museum/metaAgent/MeetingMetaAgent.tsx#L383))
and must keep its current inert icon.

**Three states, not two:**

| State | When | Icon | Click |
|---|---|---|---|
| Spinner | `connectionState !== "ready"` — covers the landing page, the "Let's go" handshake, a reconnect, and the restart after an agent-off | loading animation, matches `SetupAgentOverlay`'s existing `Lottie` spinner | inert |
| `record_voice_off` | ready, mic not attached | outline icon | `attachMic()` |
| `record_voice_on` | ready, mic attached, visualiser animating | filled icon | `detachMic()` |

Gating on `connectionState` rather than a separate flag means the button is naturally inert
before "Let's go" too, with no extra state to track.

One exception to "inert": when the agent is **off** (corner button, below), the mic button is
clickable and means *"turn everything on and let me talk"* — it starts the session and attaches
the mic once the connection reports ready. That is a small pending intent held in
`useSetupAgent`, not a new subsystem.

### Corner button → agent on/off

The bottom-left slot survives with the `ai` / `ai_filled` icon pair swapped for
`volume_on` / `volume_off` (both already in `assets/icons`). **It tears the session down** — it
is a real off switch, not an output mute.

That falls out of the state model: "connected but not listening" is already the *default* state
(the commentator), so a mute that only silenced output would be a third state barely
distinguishable from mic-off, while still paying for the session. Off means off.

Mechanically this is **today's `agent.stop()` / `agent.start()` unchanged** —
`useSetupAgent`'s `muted` flag already drives `sessionActive: !muted`, which tears down WebRTC
and releases everything. Only the icon and the label change. No `setAgentOutputMuted` needed.

| Control | Meaning | Session |
|---|---|---|
| corner `volume_on` → `volume_off` | agent off: no voice, no captions, no mic, no cost | torn down |
| corner `volume_off` → `volume_on` | agent back as commentator, mic stays off | reconnect (~1–2 s, mic button spins) |
| mic button while off | "turn on and let me talk" | reconnect, then attach mic when ready |

Two consequences worth knowing up front:

- **No pre-connect mute problem.** Off means "don't connect", so muting before or during the
  handshake is trivially correct — nothing to race.
- **A restart is a fresh session.** The agent loses conversation history; `buildSetupAgentPrompt`
  rebuilds context from phase, selections and visitor name, so it recovers well. But
  `triggerGreetingOnReady: true` means it opens with its cold-start greeting, which reads oddly
  mid-setup. Prefer the "visitor has returned" phrasing `useAgentPresence` already uses for its
  own resume ([useAgentPresence.ts:70](../client/src/setupAgent/useAgentPresence.ts#L70)) — the
  teardown/resume path itself is well-trodden, this is only about which line it opens with.

### Blocked overlay

Unchanged from the previous plan: a `MicrophoneBlocked` overlay in the shape of `ResetWarning`,
rendered from `Main.tsx` next to `CouncilError`/`Reconnecting`, driven by a shared store so
`HumanInput` can raise it too. Trigger table:

| Trigger | Overlay? |
|---|---|
| Mic button clicked while blocked, or click → attempt → denied | **Yes** |
| `HumanInput` mic icon clicked while blocked | **Yes** |
| Anything automatic | No — the agent simply keeps talking without listening |

Since the mic is now only ever requested from a click, "silent first denial" mostly stops
existing as a case: every denial is a response to an explicit request, and so every denial
earns the overlay.

---

## 5. Agent behavior with the mic off

This is the part that needs prompt work, not just plumbing.

- **Two prompt variants.** The agent must know whether the visitor can speak. With the mic off
  it should comment, react to clicks, and mention the mic button as the way to talk; with the
  mic on it behaves as today. `buildSetupAgentPrompt` already takes `agentMode` and
  `isWebMode`; add a `micOn` input and call the hook's existing `reconfigureSession` on toggle.
- **Nudges — keep them, reword them.** Decided: the nudge timer stays active with the mic off
  (it is the mechanism that makes the commentator feel alive while the visitor silently
  browses). Only the *content* changes — `useInactivityNudge`'s current message
  (*"the visitor is quiet, gently prompt them to respond"*) presumes a voice reply is coming;
  swap in something like "the visitor is browsing without talking; comment on what they're
  looking at" when `micOn` is false, keeping today's wording when it's true.
- **Presence teardown must count clicks.** `useAgentPresence` tears the session down after 3
  minutes without *speech* ([useAgentPresence.ts:85](../client/src/setupAgent/useAgentPresence.ts#L85)).
  With a mic-less commentator "no speech" is the normal state, so as written it would kill the
  agent mid-setup on every web visit. The idle timer must key off any user activity — clicks and
  selections as well as transcripts. When it does fire, the corner icon honestly reads
  `volume_off` (same state), so the visitor can bring the agent back with one click.
  Note this shares the `muted` flag with the corner button, which is fine:
  `useAgentPresence` only auto-resumes teardowns it caused itself (`stoppedByBackgroundRef`),
  so it will never silently undo a deliberate off.
- **Mic stays open until clicked off.** No auto-close on silence — VAD replying to background
  noise is the visitor's to manage, same as any voice UI.
- **Cost.** Every web visitor who clicks "Let's go" now opens a realtime session for the whole
  setup. Option A sends **zero** audio until the mic button is pressed (measured, §2), so STT —
  which Inworld bills by audio duration — costs nothing for the click-through majority; LLM and
  TTS for the commentary remain, and the corner off switch drops even those to zero. Worth a
  number before flipping `agentMode` on for all web traffic.

---

## 6. Mic permission mechanics (carried over)

Unchanged from the previous plan, minus the auto-start path that no longer exists:

- **`"unavailable"`** joins `"fatal" | "retryable"` in `classifyRealtimeError`: on web, every
  `MicrophoneUnavailableError` is `unavailable` (no retry, no report); museum keeps `fatal`.
- **`micAvailabilityStore`** (zustand, `sessionStorage`-backed): `status` +
  `reason` + `noticeOpen`, shared by the setup agent and `HumanInput`, refreshed from
  `navigator.permissions.query({name:"microphone"})` where supported (Chromium yes, Firefox no,
  Safari partial — wrap in try/catch, treat failure as "just try") and kept live by
  `permissionStatus.onchange`, so a visitor who allows the mic in site settings gets the mic
  button working without a reload.
- **Web denials are not reported** to errorbot.
- **Browser reality:** a second `getUserMedia()` usually does *not* re-prompt — Chrome and
  Safari persist the block, Firefox re-prompts only after a reload. That is why the overlay
  gives instructions rather than just retrying.

`HumanInput` (unchanged from the previous plan): skip the pre-warm when the store says blocked
— which also kills its reconnect loop — keep the textarea fully usable, and raise the overlay
when its mic icon is clicked.

---

## 7. Bugs to fix along the way

1. **Stuck `connecting` on a slow prompt.** `start()` races the bootstrap fetch (15 s timeout)
   against mic acquisition and treats *any* `AbortError` as our own cancellation
   ([useRealtimeVoiceSession.ts:743](../client/src/realtime/useRealtimeVoiceSession.ts#L743)),
   leaving the spinner up forever with no retry. Less likely once the mic leaves the connect
   path, but still wrong.
2. **`HumanInput` reconnect loop** on a denied mic
   ([HumanInput.tsx:368](../client/src/council/humanInput/HumanInput.tsx#L368)).
3. **Swallowed `play()` rejection** (§3).
4. **Doc drift:** [agent-error-handling-plan.md](./agent-error-handling-plan.md) calls museum
   mic denial *retryable*; the code makes it fatal. Keep the code, fix the doc.

---

## 8. Files

### Added

| File | Purpose |
|---|---|
| `client/src/realtime/micAvailabilityStore.ts` | Shared mic status + notice flag |
| `client/src/main/overlay/MicrophoneBlocked.tsx` | Blocked overlay content |
| `client/tests/unit/realtime/micAvailabilityStore.test.ts` | Status transitions, session persistence |

### Modified

| File | Change |
|---|---|
| `client/src/realtime/realtimeConnection.ts` | Mic-less connect (option A), expose audio sender, `"unavailable"` kind, permission-query helper |
| `client/src/realtime/useRealtimeVoiceSession.ts` | `attachMic`/`detachMic` replacing `setMicEnabled`, `onUnavailable`, abort-vs-timeout fix, `play()` rejection handling |
| `client/src/realtime/RealtimeCaptionOverlay.tsx` | Interactive centre mic button (**opt-in prop** — meta agent keeps today's inert icon); mode-neutral viz row |
| `client/src/setupAgent/useSetupAgent.ts` | Connect gate (permission + `phase`); mic attach/detach state; pending "start then attach mic" intent; degrade-not-report |
| `client/src/setupAgent/MeetingSetupAgent.tsx` | Wire toggle + `micOn` into prompt/`reconfigureSession` |
| `client/src/setupAgent/SetupAgentOverlay.tsx` | Corner slot becomes `volume_on`/`volume_off` (same stop/start as today, new icons); pass mic toggle through |
| `client/src/setupAgent/setupAgentPrompt.ts` | Mic-off vs mic-on variants |
| `client/src/setupAgent/useInactivityNudge.ts` | Mic-off nudge wording |
| `client/src/setupAgent/useAgentPresence.ts` | Idle timer counts clicks, not just speech; resume greeting wording |
| `client/src/council/humanInput/HumanInput.tsx` | Blocked-aware pre-warm, overlay on mic click, loop fix |
| `client/src/main/Main.tsx` | Render `MicrophoneBlocked` |
| `client/src/locales/translation_en.json` | Overlay + tooltip strings (only `en` exists in this repo) |

---

## 9. Phasing

0. ~~**Spike** — option A against Inworld~~ **done, A confirmed** (§2).
1. ~~**Foundation** — mic-less connect + `attachMic`/`detachMic`; `"unavailable"` kind;
   `micAvailabilityStore`; permission query/`onchange`; bugs 1 and 3.~~ **done** — nothing
   consumes `deferMic` yet, so behavior is unchanged until phase 2.
2. ~~**Web UI** — connect gate (permission + `phase`); centre mic button + visualiser; corner slot
   → agent on/off; `MicrophoneBlocked` overlay; re-attach the mic after a reconnect.~~ **done**
   — web now connects mic-less and the mic is opt-in. Still gated behind `agentMode` (phase 5).
3. **Agent behavior** — prompt variants (mic-off vs mic-on), `reconfigureSession` on toggle,
   nudge wording for a browsing visitor. Note the idle/nudge *timers* already count clicks via
   `useAgentPresence`'s `lastActivity`, so only the wording is left.
4. **HumanInput** — blocked-aware pre-warm, overlay on mic click, loop fix.
5. **Enablement** — flip web `agentMode` to `always-on` once costs are understood.

Tests per [TESTING.md](../TESTING.md) — behaviors worth pinning: connect succeeds with no mic;
`attachMic` swaps the sender's track without a new connection; toggle off releases the mic;
classification by mode; web denial degrades without `setUnrecoverableError` and without a
report; overlay opens on explicit request only; connect gate (no connect on `landing`, connect
on `topic`); `HumanInput` blocked → no loop, typing still works.

---

## 10. Decisions log

All questions from earlier rounds are settled — nothing blocks implementation.

| # | Question | Decision |
|---|---|---|
| 1 | Can WebRTC connect without mic permission? | Yes — **option A**, spiked against live Inworld (§2) |
| 2 | When does the agent start? | Permission `granted` → immediately, landing included; otherwise at "Let's go" (§3) |
| 3 | Mic button during connect | Spinner until `ready`; clickable when the agent is off, as "start + attach" (§4) |
| 4 | Corner button | `volume_on`/`volume_off`, **tears the session down** — today's stop/start with new icons (§4) |
| 5 | Bottom-centre slot conflicts | None during setup; the meta agent's copy stays inert via prop (§4) |
| 6 | Nudges with the mic off | Keep them; reword for a browsing, non-speaking visitor (§5) |
| 7 | Idle teardown | Keep, but count clicks and selections as activity, not just speech (§5) |
| 8 | Mic auto-close on silence | No — the visitor turns it off when they want (§5) |
| 9 | Web mic denials reported? | No (§6) |
| 10 | Copy | `en` only for now; downstream Council of Forest adds translations later |

Two small calls made in passing, worth a second look during implementation rather than now:

- **Resume greeting.** A restart after agent-off is a fresh session, so the cold-start greeting
  would fire mid-setup; use the "visitor has returned" phrasing instead (§4).
- **`agentMode` naming.** Web `always-on` now means "commentator with opt-in mic", which is not
  what the name suggests. Branching on `isMuseumMode` keeps the enum as-is; renaming can wait
  until the web flip (phase 5) if it starts to grate.

---

## 11. Manual checklist

- [ ] First visit, `/` in Chrome → no mic prompt, no permission chip, agent silent
- [ ] "Let's go" → agent connects and greets **audibly**, no mic prompt, no recording indicator
- [ ] Return visit with permission granted → agent greets on the landing page itself
- [ ] Mic button shows a spinner until the connect completes, then flips to `record_voice_off`
- [ ] Click topic / characters → agent comments (mic still off)
- [ ] Corner button clicked mid-sentence → agent stops instantly; session torn down, mic released
- [ ] Corner button back on → reconnects, mic button spins then returns to off, agent resumes with a return-style line (not the cold greeting)
- [ ] Click mic button while the agent is off → one gesture: reconnect, then mic attaches when ready
- [ ] Click mic button → prompt appears → allow → visualiser animates, conversation works
- [ ] Click mic button again → mic released, recording indicator gone, agent still comments
- [ ] Toggle mic on again → no second prompt, mic live immediately (no reconnect)
- [ ] Browse for 3+ minutes while clicking around → agent survives (clicks count as activity)
- [ ] Deny at the prompt → blocked overlay → close → clicking through the setup still works
- [ ] Allow via padlock while the page is open → mic button works without reload (`onchange`)
- [ ] Safari desktop + iOS: agent audible after "Let's go"; captions advance (AudioContext resumed)
- [ ] Firefox: block without "remember" → reload → prompt appears again
- [ ] Meeting with mic denied: typing works, mic icon → overlay, no reconnect loop
- [ ] Museum regression: PTT hardware button, LED, viz, and mic failure → `CouncilError` + reload
