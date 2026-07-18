# Test review — slice 3: realtime voice (client + server protocol together)

> **Status: reviewed, no test changes applied.** Client 835 / server 442 tests unchanged;
> all green; type-check and lint clean. One significant **production-code** finding surfaced
> (dead routes) — flagged below for a decision, not acted on, since it's outside the scope of
> a test-coverage pass.

Verdicts against [TESTING.md](../TESTING.md). Files reviewed — 17 files, ~3737 lines, the
largest slice: client `realtime/{realtimeProtocol,realtimeConnection,useRealtimeVoiceSession,
RealtimeCaptionOverlay}.test.ts(x)`, `api/realtimeSession.test.ts`,
`voice/{guideTools,guidePrompt,useVoiceGuide,VoiceGuideOverlay,MeetingVoiceGuide.ptt,
captionScheduler,inworldSubtitleTrack,realtimeEventLoop}.test.ts(x)`; server
`realtimeProviders.test.ts`, `realtimeSessionApi.integration.test.ts`,
`voiceGuideSession.test.ts`, `ValidationCustomVoice.test.ts`.

**Overall:** this is the best-tested corner of the codebase. `realtimeEventLoop.test.ts` and
`realtimeConnection.test.ts` in particular read like a running log of production incidents
each regression test guards against (the session.updated race, the cancel-cascade bug, the
stale-closure tool-handler bug, the empty-response retry), which is exactly what
"testing behaviors, not implementation" should look like at the protocol boundary. No
duplicate or dead test logic was found anywhere in the 17 files — a first for this review
series. One real issue surfaced, but it's in production code, not the tests.

## Finding: dead routes behind a misleadingly-covered test file

`server/src/api/voiceGuideSession.ts` was flagged by the mechanical inventory at 0%
statement coverage despite `voiceGuideSession.test.ts` existing (133 lines, 7 passing
tests) — exactly the "testing the wrong thing" pattern this whole review was started to
find.

**What's actually happening:**
- `voiceGuideSession.ts` re-exports `createInworldCall`/`getInworldIceServers` from
  `realtimeProviders.ts` (`export { createInworldCall, getInworldIceServers };`) and defines
  its own unique code: `registerVoiceGuideRoutes(app)`, which wires
  `GET /api/voice-guide/bootstrap` and `POST /api/voice-guide/call` onto the Express app,
  including their 400/500 error handling.
- `voiceGuideSession.test.ts` imports and calls `createInworldCall`/`getInworldIceServers`
  directly — real, valid tests, but of code that *lives in* `realtimeProviders.ts`. Coverage
  attributes to the file where the code is defined, so `voiceGuideSession.ts` shows 0%: none
  of its own lines (the two route handlers) ever execute.
- **`registerVoiceGuideRoutes` is never called anywhere.** `server.ts` only registers
  `registerMeetingRoutes` and `registerAudioRoutes`; grepping the entire repo turns up no
  caller. The client doesn't hit `/api/voice-guide/*` either — `client/src/api/realtimeSession.ts`
  and every voice-guide/meta-agent/human-input caller uses `/api/realtime/bootstrap` and
  `/api/realtime/call`, served by the *different* `registerRealtimeRoutes` in
  `server/src/api/realtimeSession.ts` (well-covered by `realtimeSessionApi.integration.test.ts`,
  read in this slice — real HTTP integration, auth boundaries per feature, provider-override
  enforcement).
- Git history (`git log -- server/src/api/voiceGuideSession.ts`) points to the `unified
  realtime connections` commit, which appears to have introduced the shared `/api/realtime/*`
  endpoints and superseded the voice-guide-specific ones without removing the old file.

**Net effect:** `/api/voice-guide/bootstrap` and `/api/voice-guide/call` are dead code —
defined, exported, documented with a doc-comment, but unreachable in the running server. The
test file's presence and passing status gives the impression the voice-guide session proxy
is tested end-to-end; it isn't, because that code path can't run.

**Not acted on:** deleting `registerVoiceGuideRoutes` (and possibly the whole file, if the
re-exports aren't used as an import path elsewhere) is a production-code change, not a test
change, and it's the kind of call — "is this actually obsolete, or a deliberate fallback
kept for a reason?" — that belongs to whoever owns this code, not to an autonomous test
review. Flagging for a decision:
- If dead: delete `registerVoiceGuideRoutes` and its two route handlers from
  `voiceGuideSession.ts` (keep or drop the re-exports depending on whether anything besides
  the test imports them that way), and delete the now-pointless
  `voiceGuideSession.test.ts` — the two functions it covers are already exercised (or should
  be, see below) wherever they're actually used.
- If kept intentionally (e.g. planned re-enablement): wire `registerVoiceGuideRoutes` into
  `server.ts` and add the same request/response integration coverage
  `realtimeSessionApi.integration.test.ts` and `meetingsHttp.integration.test.js` already
  establish as the house pattern (real Express app, real HTTP, mocked only at the Inworld
  fetch boundary) — 400 on missing `sdp`, 500 on Inworld failure, 200 happy path for both
  endpoints.

## Confirmed clean (read in full, no changes)

- **`realtimeProtocol.test.ts`**, **`api/realtimeSession.test.ts`** — small, precise:
  session-merge logic and the client-side bootstrap/call HTTP wrappers (auth headers, error
  fallback messages).
- **`realtime/realtimeConnection.test.ts`** (516 lines/21 cases) — full WebRTC connection
  lifecycle against a real mock `RTCPeerConnection`: bootstrap, ICE-gathering wait, event
  forwarding, teardown on both success and call-creation failure, abort-before-work, the
  retryable/fatal error classification matrix (including the museum-mode NotAllowedError
  carve-out), retry-delay jitter bounds, and microphone-acquisition error mapping. Earns
  every line.
- **`realtime/useRealtimeVoiceSession.test.ts`** (444 lines) — bootstrap wiring,
  provider-conditional caption strategy (Inworld subtitle track vs. caption scheduler for
  everyone else), the Inworld-specific `agentSpeaking` audio-anchor state machine vs. the
  simpler response-lifecycle toggle for other providers, mic enable/disable, language-change
  caption reset, session reconfigure delegation.
- **`voice/realtimeEventLoop.test.ts`** (455 lines) — the protocol event loop itself, each
  test annotated with the production bug it regression-guards: the session.updated ordering
  race, the cancel-cascade from stacking `response.create`, stale tool-handler closures via
  `getCtx()`, the empty-response retry-and-budget-reset mechanism, and full event-type
  dispatch (captions, transcripts, VAD, errors, tool calls with missing/malformed args).
- **`voice/guideTools.test.ts`** (405 lines/41 cases) — one behavior per tool handler
  (`select_topic`, `confirm_topic`, `select_character`, `switch_language`, `start_meeting`,
  etc.), happy path plus every validation error path. Size matches genuine breadth, not
  repetition.
- **`voice/inworldSubtitleTrack.test.ts`**, **`voice/captionScheduler.test.ts`** — precise
  timing-math unit tests (sentence-offset accumulation, fake-clock-driven caption reveal and
  cancellation).
- **`voice/MeetingVoiceGuide.ptt.test.tsx`**, **`realtime/RealtimeCaptionOverlay.test.tsx`**,
  **`voice/useVoiceGuide.test.ts`**, **`voice/VoiceGuideOverlay.test.tsx`**,
  **`voice/guidePrompt.test.ts`** — small, one behavior per test throughout.
  `guidePrompt.test.ts` in particular tests prompt-builder *structure* (phase-differentiated,
  name-inclusion, non-empty) rather than exact wording — the correct way to test a
  prompt-generating module without violating TESTING.md's "never assert prompt wording" rule.
- **`realtimeProviders.test.ts`** (server) — per-feature (human-input/voice-guide/meta-agent)
  and per-language (en/sv) bootstrap construction; the voice-guide and meta-agent tests look
  similar but assert genuinely different `providerData.tts` fields
  (`steering_handling`/`segmenter_strategy` only for meta-agent), confirming real behavioral
  difference, not copy-paste duplication.
- **`realtimeSessionApi.integration.test.ts`** (server) — real HTTP integration for the
  *actually-wired* `/api/realtime/*` routes: per-feature auth boundaries (400/401/403/200),
  and the meta-agent provider-override enforcement (server ignores a client-requested
  provider).
- **`ValidationCustomVoice.test.ts`** — one assertion per test is correct here, not weak; each
  test verifies one schema-validation branch (custom voice IDs allowed for
  Inworld/ElevenLabs, restricted to an enum for OpenAI).
