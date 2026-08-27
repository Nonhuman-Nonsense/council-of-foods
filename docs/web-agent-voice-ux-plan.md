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

### Resolved: hold the greeting, not the connection

The shipped answer gates neither the connection nor the page, but the **greeting**.

Earlier iterations gated *connecting* on a `canAutoplayAudio()` probe plus "has any gesture
happened yet". That was subtly wrong, and it failed in practice: the probe is answered on the
gesture, but the real `el.play()` happens whenever the WebRTC handshake finishes — bootstrap,
ICE, SDP, a second or two later. Chrome's transient activation for that gesture can lapse in
between, so the gate said yes and playback was still refused. The agent connected, greeted,
worked perfectly, and was inaudible.

What ships instead:

- **The session connects on page load, always.** With `deferMic` there is no microphone prompt
  and no inbound audio, and a held greeting means no TTS — an untouched session sends and
  receives nothing.
- **The greeting is queued and held** (`configureSession({ holdGreeting })`,
  released by `setGreetingHeld(false)` in
  [realtimeEventLoop.ts](../client/src/realtime/realtimeEventLoop.ts)). Remote audio is a live
  stream, not a buffer, so speaking early loses the words rather than delaying them.
- **`audible` is the one gate** — `unattended || autoplayAllowed`, passed into
  `useRealtimeVoiceSession`. When it flips true the greeting is released, `el.play()` runs, and
  the anchor's suspended `AudioContext` is resumed. The gesture and the `play()` are now the
  same event, so the race that caused the bug cannot exist.
- **Any gesture retries a refused `play()`** as insurance, since `audible` is a heuristic
  answered before the audio element exists and Safari is fussier than Chrome.

The visitor-facing win is speed: the handshake is behind us by the time they first click, so the
wait collapses from *bootstrap + ICE + SDP + session.update + greeting* to just the greeting.

An abandoned session is not left open — the existing absolute idle teardown
([useAgentPresence.ts:100](../client/src/setupAgent/useAgentPresence.ts#L100)) stops it after
three minutes with no speech, whether or not the visitor ever interacted.

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

### Blocked overlay — one trigger, no consumer opens it

A `MicrophoneBlocked` overlay in the shape of `ResetWarning`, rendered from `Main.tsx` next to
`CouncilError`/`Reconnecting`, wrapped in `OverlayWrapper` so it gets the app's standard
dismissal — the corner ✕ and click-anywhere-outside — for free.

**Every microphone request in the app goes through `requestMicrophone()`**, which records the
outcome in the store *and* owns the overlay:

```ts
requestMicrophone({ userInitiated: true })   // a mic button — explain a failure
requestMicrophone()                          // a background pre-warm — stay quiet
```

So consumers never open the overlay, never import it, and never learn the rules; they say only
whether the visitor asked. The distinction is load-bearing rather than decorative:
`HumanInput` pre-warms the mic automatically when the participation phase opens, and a modal
appearing mid-meeting because of a background failure would be exactly the unprompted
interruption we ruled out for the setup agent.

| Trigger | Overlay? |
|---|---|
| Setup agent mic button, or `HumanInput` mic icon | **Yes** — `userInitiated` |
| Automatic re-attach after a reconnect, `HumanInput` pre-warm | No |

**Not merged with `ResetWarning`/`AutoplayWarning`.** They share an `<h2>/<h4>` shape but differ
in what their buttons mean — confirm/cancel a destructive action, acknowledge information, or a
timed auto-confirm. A generic warning component would need a props union covering all three to
save about a dozen lines. What "reuse" was actually wanted here was the ✕ and click-outside,
and that comes from `OverlayWrapper`, which is orthogonal to merging the content components.

---

## 5. Agent behavior with the mic off

This is the part that needs prompt work, not just plumbing.

- **One prompt that knows about the microphone** *(revised — see §5b)*. The first
  implementation used two separate prompts; that made the mic toggle a personality transplant
  the agent was never told about. Replaced by a single prompt plus a current-state block.
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

## 3b. The start gate, corrected

Testing turned up a visible bug and, behind it, a wrong assumption.

**The bug:** on a first visit the mic button spins forever until "Let's go" is pressed. The
button derives its state as `!isReady ? "connecting"`, which cannot tell "still connecting"
from "deliberately never started". The gate is working; it just looks broken.

**The wrong assumption:** the gate uses `micAvailability === "granted"` as a proxy for "audible
autoplay will work". Checked against the actual policies:

| | Audible autoplay on a cold visit | Mic permission grants autoplay? | Gesture grants autoplay? |
|---|---|---|---|
| Chrome | blocked (unless high Media Engagement Index) | **No** | Yes |
| Firefox | blocked | **Yes** — Firefox alone | Yes |
| Safari | blocked | **No** | Yes |

So the delay is genuinely needed — no browser lets a cold visit speak, not just Safari — but the
proxy we gate on is only correct in Firefox. On Chrome and Safari a returning visitor with a
granted mic gets connected and speaks into an element the browser has muted, losing the greeting
and paying for the session. And a visitor deep-linked straight to `/new` skips the gate entirely
(`phase !== "landing"`), on the assumption they clicked their way there — which a pasted link
disproves.

### Stop guessing, ask the browser

Replace the proxy with a real check, in a new `client/src/audio/canAutoplay.ts`:

- `navigator.getAutoplayPolicy("mediaelement")` where it exists — **Firefox 112+ only**, per
  [caniuse](https://caniuse.com/mdn-api_navigator_getautoplaypolicy); Chrome, Edge and Safari
  have not shipped it.
- `navigator.userActivation.hasBeenActive` — sticky activation is exactly the condition all
  three engines require, and reading it beats re-probing at a moment that races the browser's
  own bookkeeping.
- Cold, with neither of the above: ask by trying — play a short silent **unmuted** WAV and see
  whether the promise resolves. Unmuted matters, since muted autoplay is always allowed and
  would answer the wrong question. **Build the file at runtime**, never paste it in as base64: a
  pasted blob lost one padding character, decoded to nothing, and turned every probe into a
  confident "blocked" in every browser.

This also picks up Chrome's Media Engagement Index, which no heuristic of ours could infer: a
returning visitor who has listened before gets greeted immediately.

### The resulting gate

```
connect when:  isMuseumMode || autoplayAllowed || visitorStartedItThemselves
```

`phase` drops out entirely. "Let's go" is no longer special — it is simply *a* gesture, and any
gesture flips the answer, so a one-shot `pointerdown`/`keydown` listener re-probes and the agent
connects. That fixes the deep-link hole for free: the first topic click starts the agent.

### What the landing page looks like

Both controls stay visible and clickable, neither spinning:

| Control | Before the agent starts | On click |
|---|---|---|
| Mic button (centre) | `off` — never `connecting` unless a connect is genuinely in flight | starts the agent *and* takes the mic; the click is itself the gesture that unblocks audio |
| Volume button (corner) | `volume_on` — sound is armed, the agent will speak when it starts | mutes: now even "Let's go" will not start it |

An explicit start has to override the gate rather than wait for the probe, so the click path is
deterministic instead of racing an async check.

---

## 5b. Crossing between the two modes

The mic button flips the agent between commentator and conversation partner mid-session. Phase 3
shipped the two ends of that journey but not the crossing: two disjoint prompts swapped by a
`session.update`, with nothing telling the agent anything had happened. From the model's side a
new brief and a new tool set simply appear — it has no way to notice, so it keeps narrating in
commentator voice until something else triggers a response, and a visitor who just pressed the
mic button gets silence.

Three changes fix it. They are deliberately small; the whole design leans on the agent
understanding its situation rather than on us policing it.

### 1. Back to one prompt, with a state block

Revert to the single prompt (the pre-phase-3 construction) and teach it that the microphone
exists. The agent should always know the whole world — both modes, all the tools — and simply be
told which mode is live right now.

Why unify rather than keep two:

- The transition stops being a discontinuity. The agent already knows what "mic on" means when
  it happens, because that possibility was described from the start.
- No duplication. The split version repeats the topic list, the food list and the "what makes a
  good council" guidance in both branches — three things that change often.
- The mic-off rules are an *exception layer* over the normal job, which is what they actually
  are, rather than a parallel universe.

Structure (extending what is already there):

```
[identity, general rules]
[project context]
[phase jobs]                      ← unchanged, written for conversation
[visitor name]
[CURRENT SITUATION]               ← existing trailing status block, extended
   - phase (already there)
   - microphone: ON | OFF
   - when OFF: the exception rules — no questions, no confirmations, comment on
     clicks only, don't drive the setup, mention the mic button once early
   - either way: "the visitor can turn their microphone on or off at any time
     with the button at the bottom of the screen; you will be told when they do"
```

The trailing block is the right home: it is the last thing the model reads (strongest recency),
it already exists for phase, and it is where an override belongs — the phase jobs above it are
written conversationally ("Ask if they are ready to begin"), and with the mic off those
instructions must lose.

The state block still changes on every toggle, so `reconfigureSession()` still fires on every
toggle. That part of phase 3 stays as-is.

### 2. Tell the agent, in the conversation, that it changed

`session.update` changes what the agent *is*; it does not tell it that anything *happened*. The
codebase already has the mechanism for "something happened the model cannot perceive" — the
click-reaction pipeline (`buildMeetingSetupReactionMessage` → `(The visitor just selected…)`).
A mic toggle is the same shape.

Both directions send a plain `sendUserMessage` — a fact on the record, with **no response
requested**:

| Transition | Message |
|---|---|
| off → on | `(The visitor just turned their microphone on — you can hear them now.)` |
| on → off | `(The visitor just turned their microphone off.)` |

Neither should make the agent talk. Someone who just pressed the mic button is about to speak,
and an "ah, I can hear you now" would collide head-on with their first sentence; someone who
just muted has asked for less, not more. In both cases the agent only needs to *know*. The
next thing it says is prompted by the visitor — a click, a sentence, or the idle nudge.

The messages state the fact and nothing else. The prompt already carries the rules for each
mode, and restating them here would be a second, drifting copy.

Not routed through `MeetingSetupAgent`'s click-reaction path on purpose: that path exists to
*debounce and merge* rapid clicks, and a mic toggle is a single deliberate act with nothing to
merge. Keeping it in the hook also keeps "mic state changed" as one unit.

### 3. Tools: always present, gated at the handler

Phase 3 filtered the tool *list* by mic state, which forced a `session.update` on every change.
Two problems: the bidirectional version deleted tools the moment the mic went off — breaking
"pick that one" followed immediately by muting, where the call lands a beat after the words —
and even the latched version made the session config the carrier for something the prompt can
state in a sentence.

So: **the agent always holds every tool**, and the gate moves to the handlers.

| State | Behaviour |
|---|---|
| Visitor has never spoken this session | state-changing handlers refuse with an instructive error; `current_topic` / `current_characters` still work |
| Visitor has spoken at any point | every handler works normally, mic on or off |

`hasEverHeardVisitor` stays a latch, so the guard only ever opens, never closes — the
spoken-then-muted command still lands. Museum starts latched.

The refusal is a safety net, not the mechanism: the prompt tells the agent not to act for a
visitor who is clicking their own way through, and the guard is there for when it tries anyway.
Its error text should explain rather than scold — *"The visitor has not spoken to you yet; they
are choosing on screen themselves"* — so the agent narrates instead of apologising.

**Tool descriptions stay as they are.** Writing "only available when the microphone is on" into
each one would contradict reality in the exact case the latch exists for — mic off, tools
present, acting on something just spoken.

### 4. No `reconfigureSession` for the setup agent at all

With the tool list static and mic state carried conversationally, nothing in the session config
depends on the microphone any more — so the setup agent never re-sends it. `configureSession`
does more than deliver instructions ([realtimeEventLoop.ts:279](../client/src/realtime/realtimeEventLoop.ts#L279)):
it sets `sessionReady = false` and clears `pendingDeferredResponse`, `pendingCreateEventId` and
`createRejectedRetries`. Doing that on a mic toggle can silently drop a click reaction that was
queued waiting for the session to be ready.

`reconfigureSession` goes back to meaning what the meta agent uses it for: the job itself
changed. That agent swaps prompt, tools and handlers wholesale per phase
([MeetingMetaAgent.tsx:94](../client/src/museum/metaAgent/MeetingMetaAgent.tsx#L94)) — a
different agent on the same connection. Turning a microphone on and off is not that.

**Consequence for the prompt:** instructions are only ever sent at connect, so anything in them
that depends on mic state describes the session's *starting* state. Phrase it that way — "when
this session started, the microphone was OFF" is true forever, where "currently the mic is OFF"
silently rots after the first toggle. The mic section then needs one line saying the visitor can
switch it at any time and that the agent is told when they do, so the conversation is the
authority on the current state. (A reconnect rebuilds the prompt from the live state, so a
dropped session with the mic on still describes reality correctly.)

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
3. ~~**Agent behavior** — prompt variants (mic-off vs mic-on), `reconfigureSession` on toggle,
   nudge wording for a browsing visitor.~~ **done, but half-right** — the two ends work, the
   crossing between them does not. `useSetupAgent` now takes `instructions`/`tools` as builders
   over a `SetupAgentContext`, which stays; the two-prompt split and the bidirectional tool
   filter do not.
3b. ~~**The crossing** (§5b) — single prompt describing both modes; the transition announced in
   the conversation; tools latched on `hasEverHeardVisitor`.~~ **done**.
3d. ~~**Drop `reconfigureSession` from the setup agent** (§5b, revised) — static tool list,
   handler-level guard on `hasEverHeardVisitor`, both mic notices sent as plain
   `sendUserMessage` with no response requested, prompt phrased as the session's starting
   state.~~ **done** — the setup agent now never re-sends its session config; `reconfigureSession`
   is the meta agent's alone.
3c. ~~**"Let's go" was invisible to the agent.**~~ **done** — every other step change
   already reached the agent as a `MeetingSetupUserEvent`, but the landing button was a bare
   `<Link>` that notified nobody, so a mic-off visitor moved to topic selection while the agent
   was still working from the welcome step. Added a `setup_started` event, fired from the link.
4. ~~**HumanInput** — blocked-aware pre-warm, overlay on mic click, loop fix.~~ **done**, and
   smaller than planned once the overlay moved into `requestMicrophone`: `HumanInput` skips the
   pre-warm when the store says the mic is unavailable (which is the loop fix), and its mic
   click acquires permission, connects with the stream, and records — one gesture. Typing is
   untouched throughout. `createRealtimeConnection`'s internal `getUserMedia` fallback is gone:
   every caller now supplies a stream or sets `deferMic`, so no path can prompt behind the
   store's back.
4b. ~~**The start gate, corrected** (§3b)~~ **done** — `client/src/audio/canAutoplay.ts` asks the
   browser (`getAutoplayPolicy` on Firefox, a silent unmuted probe elsewhere, re-checked on the
   first gesture); `useSetupAgent` gates on that instead of mic permission, with an explicit
   start overriding it; the mic button spins only while a connect is genuinely in flight.
   `phase` is gone from `useSetupAgent` entirely — the gate no longer cares which page it is on,
   which also closes the deep-link hole. `refreshMicAvailability` moved to `Main.tsx`, where it
   serves `HumanInput` rather than a gate that no longer reads it.
5. **Enablement** — flip web `agentMode` to `always-on` once costs are understood.

Known loose ends, none blocking:

- **Autoplay affordance.** The `play()` rejection is logged (phase 1) but there is still no
  "tap for sound" recovery — a Safari visitor could get a silent agent with no way back. Decide
  after real-device testing (§3).
- **Swedish copy** for the mic notice and agent tooltips, downstream in Council of Forest.
- **`agentMode` naming** — web `always-on` now means "commentator with opt-in mic".

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
