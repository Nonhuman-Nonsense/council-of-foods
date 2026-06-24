# Meta agent realtime UX — unified voice session plan

Unifies the **meeting meta agent** and **setup voice guide** so they look and feel
the same to the visitor: shared captions, shared subtitle timing, shared realtime
glue. Also covers meeting freeze/resume, chair animation, and silence after
`resume_meeting`.

> **Supersedes** parts of [meta-agent-plan.md](./meta-agent-plan.md) (UI, pause,
> captions, button routing). That doc remains useful for history and server/bootstrap
> context. Button intent routing is documented in code (`buttonIntent.ts`) and
> [ptt-human-input-routing-plan.md](./ptt-human-input-routing-plan.md).

**Status:** Phases **0–5b** complete on Foods; **3b** + **4** complete on Forest. **Next:** merge 5a/5b to Forest, then manual regression checklist. Implement **one phase at a time**.

---

## Goals

1. **Same UX** for voice guide and meta agent (captions, PTT hint, timing).
2. **Council orchestrates modes** — leaf components mount/unmount; minimal `metaAgentActive` conditionals inside them.
3. **Meeting freezes** when the meta agent is active; **resumes from the same place** after `resume_meeting`.
4. **Chair animates** while the agent is speaking (`response.created` → `response.done`, v1).
5. **No agent speech** after `resume_meeting` (prompt + event-loop + hard mute).

---

## Architecture (target end state)

### Two audio paths (keep separate)

| Audio | Mechanism | Frozen by meeting playback pause? |
|-------|-----------|-------------------------------------|
| Council meeting | `meetingAudioContext` + `AudioOutputMessage` | Yes — pauses in place |
| Forest scene bed | `sceneAudioContext` — ambient + BeingAudio (Forest only) | No |
| Voice guide / meta agent | WebRTC → hidden `<audio>` element | No — independent |

Meta agent activation must **not** rely on suspending the agent path. Freezing the
meeting uses `setAudioPaused(true)` only.

### Do not overload `isPaused`

| State | Meaning |
|-------|---------|
| `isPaused` | User pause (controls, tab visibility, overlays) |
| `setMeetingPlaybackPaused` | Freeze **meeting** Web Audio + subtitle clock |
| `metaAgentActive` | Council mode: meta-agent session UI is shown |

On meta agent activate: `setMeetingPlaybackPaused(true)` + `setMetaAgentActive(true)` — **not** `setPaused(true)`.

On `resume_meeting`: `setMetaAgentActive(false)` + `setMeetingPlaybackPaused(false)`.

`playingNowIndex` is unchanged throughout — no seek logic.

### Council as mode router

```text
Council
├── FoodsCouncilScene          (mode: "meeting" | "meta-agent")
├── MeetingLayer               (mounted when !metaAgentActive)
│   ├── Output                 (council subtitles + Web Audio)
│   └── ConversationControls
├── MetaAgentLayer             (mounted when metaAgentActive)
│   └── RealtimeCaptionOverlay
└── MeetingMetaAgent           (mounted when pushToTalkMode && liveKey; WebRTC always warm)
```

`HumanInput` stays mounted per existing participation rules; button intent
arbitration (`buttonIntent.ts`) handles priority vs meta agent.

### Shared realtime modules (end state)

```text
client/src/realtime/
  useRealtimeVoiceSession.ts    # shared WebRTC + captions + agentSpeaking
  RealtimeCaptionOverlay.tsx    # shared caption + PTT hint UI

client/src/voice/
  realtimeEventLoop.ts          # unchanged
  captionScheduler.ts           # unchanged
  useVoiceGuide.ts              # thin wrapper around useRealtimeVoiceSession
  MeetingVoiceGuide.tsx         # wrapper + wizard chrome

client/src/museum/metaAgent/
  useMetaAgent.ts               # thin wrapper around useRealtimeVoiceSession
  MeetingMetaAgent.tsx          # PTT + tools + Council callbacks
```

### Scene API (end state)

```ts
// Main (lifted — same on Foods and Forest)
metaAgentActive: boolean;   // camera: chair close-up for whole meta-agent session
currentSpeakerId: string;   // performer: council TTS or meta-agent speech only

// Chair id: `CHAIR_ID` from `@/prompts/characterSetupBundles` (client) or server `CHAIR_ID`
// Camera index: metaAgentActive ? CHAIR_ID : currentSpeakerId
// FoodAnimation / BeingAudio: currentSpeakerId only
```

`FoodAnimation` plays when `isPerforming` (scene composes this from `currentSpeakerId` +
`agentSpeaking` during meta-agent). Meta-agent meeting freeze uses
`meetingPlaybackPaused`, not `isPaused`.

---

## Phased implementation

Each phase should land as **one PR-sized chunk**: automated tests green, manual
checklist done, before starting the next phase.

```text
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5a ──► Phase 5b
 silence     overlay     meta        meeting     chair       shared      voice guide
             extract     captions    freeze      animation   hook (meta)  hook migrate
```

---

## Phase 0 — Silence after `resume_meeting`

**Status:** Done (Foods + Forest).

**Scope:** Stop the agent from speaking after terminal tools. No UI changes.

**Changes:**

- `ToolResult.suppressContinuation?: boolean` in `guideTools.ts`
- `realtimeEventLoop.ts`: skip `requestResponseIfIdle()` when set
- `metaAgentTools.ts`: `resume_meeting` / `restart_meeting` return `suppressContinuation: true`; tighten tool descriptions
- `metaAgentPrompt.ts`: no speech after terminal tools
- `useMetaAgent.ts`: on resume — mute remote `<audio>`, `captionScheduler.cancel()`, `setMicEnabled(false)`; optional `response.cancel` if in flight

**Automated tests:**

- Event loop: tool result with `suppressContinuation` does not send `response.create`
- `metaAgentTools`: handlers return flag
- `MeetingMetaAgent` / tool handler: remote audio muted after resume (mock)

**Manual test:**

1. Live meeting, PTT on, activate meta agent, ask to continue meeting.
2. Agent calls `resume_meeting`.
3. **Pass:** meeting audio resumes; agent does **not** say “okay, resuming…” (or any follow-up).

**Risk:** Low. Isolated from captions and Council layout.

---

## Phase 1 — Extract `RealtimeCaptionOverlay`

**Status:** Done (Foods + Forest).

**Scope:** UI-only refactor. Voice guide behavior unchanged.

**Changes:**

- New `client/src/realtime/RealtimeCaptionOverlay.tsx` — caption lines + optional `MarqueeRollingBanner` (from `VoiceGuideOverlay`)
- `VoiceGuideOverlay.tsx` — compose overlay + keep AI mute toggle / wizard chrome locally
- No meta agent or Council changes yet

**Automated tests:**

- Move or duplicate caption render tests from voice guide tests
- Assert user line + agent line order/styling (`data-testid` `voice-guide-user`, `voice-guide-caption` — keep or alias)

**Manual test:**

1. Setup flow, voice guide on, PTT or always-on.
2. **Pass:** captions and hold-to-speak banner look identical to before refactor.

**Risk:** Low. Pure presentation extract.

---

## Phase 2 — Meta agent captions + hide meeting subtitles

**Status:** Done (Foods + Forest).

**Scope:** Wire captions in meta agent; show shared overlay in Council; hide council `TextOutput` during meta agent.

**Changes:**

- `useMetaAgent.ts`: wire `createCaptionScheduler` + `onUserTranscript` (mirror `useVoiceGuide`); expose `lastCaption`, `lastUserTranscript`, `error`
- Lift caption state to `Council` (or render overlay inside `MeetingMetaAgent` with portal — prefer Council-owned `MetaAgentLayer` for orchestration)
- `Council.tsx`: when `metaAgentActive`, render `RealtimeCaptionOverlay`; hide/unmount meeting subtitle path (`Output` can stay mounted but `TextOutput` hidden, or unmount `Output` — prefer unmount in Phase 3)
- i18n: `metaAgent.holdToSpeak` (reuse or mirror `setup.holdToSpeak`)

**Still allowed in this phase:** meta agent may still call `setPaused(true)` — fixed in Phase 3.

**Automated tests:**

- `useMetaAgent`: caption + user transcript callbacks (mock event loop)
- `Council`: when `metaAgentActive`, meeting `TextOutput` not visible / no council snippet text
- Overlay shows agent + user lines when props set

**Manual test:**

1. Live meeting, PTT, press button → meta agent active.
2. Hold button, speak; release.
3. **Pass:** user transcript appears; agent reply captioned; **council subtitles hidden**.
4. **Pass:** council audio paused (even if via `isPaused` for now).

**Risk:** Medium. First meta-agent UI change; keep diff focused on captions only.

---

## Phase 3 — Meeting freeze without `isPaused`

**Status:** Done (Foods + Forest).

**Scope:** Correct pause semantics; unmount meeting playback UI during meta agent.

**Changes:**

- `MeetingMetaAgent` / activate effect: `setAudioPaused(true)` instead of `setPaused(true)`
- `resume_meeting` handler: `setAudioPaused(false)` (already resumes meeting)
- `Council.tsx`: unmount `Output` + hide `ConversationControls` when `metaAgentActive`
- Ensure tab-visibility auto-pause does not fight meta agent (only `isPaused` for user/tab; meta agent uses `audioPaused`)

**Automated tests:**

- `MeetingMetaAgent`: activate calls `setAudioPaused`, not `setPaused`
- `Council`: `Output` not in document when `metaAgentActive`

**Manual test:**

1. Mid-sentence council playback → activate meta agent → talk → `resume_meeting`.
2. **Pass:** meeting continues from **same** sentence, not restarted.
3. **Pass:** pause button (if visible) does not show “paused” state unless user pressed it.
4. **Pass:** meta agent audio audible throughout.

**Risk:** Medium. Touches Main `meetingPlaybackPaused` + Council tree.

---

## Phase 3b — Meeting vs scene audio buses (Foods prep, Forest completion)

**Status:** Done (Foods + Forest).

**Foods (this repo):**

- `client/src/audio/meetingAudio.ts` — meeting bus create/suspend/resume + `useMeetingPlaybackSuspended`
- `client/src/audio/sceneAudio.ts` — stub + `createSceneAudioContext()` for Forest merge (unused in Foods)
- `Main`: `meetingAudioContext` + `meetingPlaybackPaused` (renamed from `audioContext` / `audioPaused`)
- Council tree props: `meetingAudioContext`, `setMeetingPlaybackPaused`
- Meta agent freeze only toggles **meeting** playback pause

**Forest merge checklist:** (complete)

1. Add `sceneAudioContext` in `Main` via `createSceneAudioContext()`; pass to `Forest.tsx`
2. Rename Forest `audioContext` prop → `sceneAudioContext` on `Forest`, `AmbientAudio`, `BeingAudio`
3. Pass `meetingAudioContext` to `Council` (from Foods rename)
4. `useMeetingPlaybackSuspended(meetingAudioContext, meetingPlaybackPaused)` — do **not** suspend scene bus
5. Lift `metaAgentActive` to Main; pass to `Forest` for meta-agent mode
6. **Forest camera:** meta-agent stays **zoomed out** on the river backdrop (`river` is chair in `beings_en.json` but not a `forest_characters` zoom target). Performance/audio still uses performing-only `currentSpeakerId` + `agentSpeaking`.

**Risk:** Low on Foods; medium on Forest merge (mechanical renames + second context).

---

## Phase 4 — Chair animation (`agentSpeaking`)

**Status:** Done (Foods + Forest).

**Scope:** Performance via performing `currentSpeakerId`; camera via `metaAgentActive` at scene/Main.

**Changes:**

- `realtimeEventLoop.ts`: `onResponseDone` on `response.done`
- `useMetaAgent`: `agentSpeaking` between `response.created` / `response.done`
- `Main`: lift `metaAgentActive` (Forest merge parity)
- `Council`: publish performing-only `currentSpeakerId` (`chair` when `metaAgentActive && agentSpeaking`)
- `shared/prompts/characterSetupMetadata.ts`: `chairIdFromCharacters`
- **Foods** `FoodsCouncilScene`: layout `currentSpeakerId = chair` when `metaAgentActive`; per-item `isPerforming` for `FoodAnimation`
- **Forest** `Forest.tsx`: meta-agent zoom stays wide; `Being`/`FoodAnimation` use `isPerforming` from performing `currentSpeakerId`; river `always_on`

**Forest note:** `CHAIR_ID` is `river` from `beings_en.json`. River is the always-on backdrop, not an entry in `forest_characters.json`, so meta-agent camera does not zoom to a forest character — it stays on the wide river shot.

**Automated tests:**

- `useMetaAgent`: speaking flag toggles
- `characterSetupMetadata.test.ts`: chair id derivation
- `FoodsCouncilScene`: meta-agent layout + `isPerforming`

**Manual test:**

1. Activate meta agent; ask a short question.
2. **Pass (Foods):** Water animates **during** agent reply only; chair stays zoomed between phrases.
3. **Pass (Forest):** river visible throughout; being animates only when performing speaker matches.

**Risk:** Low. Council derivation + Main lift.

---

## Phase 5a — Extract `useRealtimeVoiceSession` (meta agent only)

**Status:** Done (Foods). Merge to Forest when convenient.

**Scope:** DRY realtime glue; migrate `useMetaAgent` first. Voice guide stays on current implementation.

**Changes:**

- New `client/src/realtime/useRealtimeVoiceSession.ts` — feature, auth, greeting, mic mode, captions, `agentSpeaking`
- `useMetaAgent.ts` — thin wrapper (liveKey bearer, `micStartsDisabled`, `trackAgentSpeaking`)
- Removed duplicated connection/event-loop/caption code from `useMetaAgent`

**Automated tests:**

- `useRealtimeVoiceSession.test.ts` — bootstrap, captions, `agentSpeaking`, mute
- `useMetaAgent.test.ts` — still passes (behavior unchanged)

**Manual test:**

- Repeat Phase 2–4 manual checklists for meta agent only.

**Risk:** Medium. Refactor; meta agent is smaller surface than voice guide.

---

## Phase 5b — Migrate voice guide to shared hook

**Status:** Done (Foods). Merge to Forest when convenient.

**Scope:** `useVoiceGuide` → `useRealtimeVoiceSession`; remove duplication.

**Changes:**

- Extended `useRealtimeVoiceSession` — `sessionActive`, `autoConnect`, `pushToTalkMode`/`micOpen`, `audioElement`, `hasReceivedAudioPart`, verbose debug
- `useVoiceGuide.ts` — thin wrapper (`muted` ↔ `sessionActive`, `isConnecting` from first audio part)
- `MeetingVoiceGuide.tsx` unchanged outwardly

**Automated tests:**

- `useVoiceGuide.test.ts` — wiring + `isConnecting`
- `useRealtimeVoiceSession.test.ts` — sessionActive, audio part flag
- `MeetingVoiceGuide.ptt.test.tsx` + voice guide suite

**Manual test:**

1. Full setup wizard in web + museum PTT.
2. **Pass:** identical to pre-migration (captions, PTT, hold-to-speak hint, mute toggle).

**Risk:** Higher. Voice guide is production-critical — do only after 5a is stable.

---

## Next / TODO

| Priority | Task | Notes |
|----------|------|-------|
| Now | **Merge 5a/5b to Forest** | Shared `useRealtimeVoiceSession`, thin `useMetaAgent` / `useVoiceGuide`, mic via `track.enabled` |
| After merge | **Manual regression** | Full checklist below (voice guide + meta agent + freeze/resume + chair animation) |
| Later | **Bootstrap retry + clearer errors** | Meta-agent bootstrap failed with `UND_ERR_CONNECT_TIMEOUT` (server → Inworld ICE fetch). Likely flaky network, not a client regression. Improve `withNetworkRetry` (include connect timeout), server logging (log target URL + `error.cause`), and optional client-side retry/backoff on bootstrap failure |

---

## Deferred (not v1)

- **Realtime bootstrap resilience** — retry `UND_ERR_CONNECT_TIMEOUT` / connect flakes; richer server logs; client retry UX for meta-agent and voice guide (see TODO table above)
- RMS / `remoteAudioAnchor` for tighter speak-sync and caption audio anchor on meta agent
- `useButtonLed` rename / `MuseumButtonProvider` rename
- Merging `MeetingMetaAgent` and `MeetingVoiceGuide` into one component
- Always-on meta agent (non-PTT)
- Lazy meta-agent WebRTC connect (bootstrap only when `metaAgentActive`) — trade warm latency for fewer spurious errors on meeting load

---

## Manual regression checklist (full stack)

Run after Phase 3+ before merging large PRs; abbreviated after smaller phases.

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Voice guide setup, PTT | Captions + hint; wizard tools work |
| 2 | Live meeting, no meta agent | Council subtitles sync with audio |
| 3 | Meta agent during `warm` | Can activate; human floor still works after |
| 4 | Meta agent during `off` | Captions; council subtitles hidden; meeting frozen |
| 5 | `resume_meeting` | Meeting resumes same position; no agent voice after |
| 6 | `restart_meeting` | Navigate home; no agent follow-up |
| 7 | Human input `active` | Takes button; meta agent yields |
| 8 | Chair animation | Animates during agent speech (Phase 4+) |

---

## File map (by phase)

| Phase | Primary files |
|-------|----------------|
| 0 | `guideTools.ts`, `realtimeEventLoop.ts`, `metaAgentTools.ts`, `metaAgentPrompt.ts`, `useMetaAgent.ts` |
| 1 | `realtime/RealtimeCaptionOverlay.tsx`, `voice/VoiceGuideOverlay.tsx` |
| 2 | `useMetaAgent.ts`, `Council.tsx`, `locales/translation_en.json` |
| 3 | `MeetingMetaAgent.tsx`, `Council.tsx`, `Main.tsx`, `audio/meetingAudio.ts` |
| 3b | `audio/sceneAudio.ts` (Forest), `Forest.tsx` (Forest only) |
| 4 | `useMetaAgent.ts`, `characterSetupMetadata.ts`, `Main.tsx`, `Council.tsx`, `FoodsCouncilScene.tsx` |
| 5a | `realtime/useRealtimeVoiceSession.ts`, `useMetaAgent.ts` |
| 5b | `useVoiceGuide.ts`, `MeetingVoiceGuide.tsx` |

---

## Changelog

| Date | Note |
|------|------|
| 2026-06-23 | Initial plan: unified realtime UX, phased for incremental testability |
| 2026-06-23 | Phases 0–4 + 3b complete; Phase 4 `isPerforming` model; Forest river backdrop note |
| 2026-06-23 | Phase 5a: `useRealtimeVoiceSession` + thin `useMetaAgent` on Foods |
| 2026-06-23 | Phase 5b: `useVoiceGuide` migrated to shared hook on Foods |
| 2026-06-23 | Meta-agent bootstrap timeout observed (`ConnectTimeoutError` on Inworld ICE fetch); retry/error UX deferred; merge 5a/5b to Forest next |
