# Voice Guide (Museum/Kiosk) — migration plan

This document is the **single source of truth** for the “voice-only guide” migration that adds an always-on (for now) speech interface to the **New Meeting** wizard (`client/src/components/NewMeeting.tsx`), using **Inworld realtime speech-to-speech** (OpenAI Realtime compatible) and **tool calls** to drive the existing React flow.

The goal is to keep the **existing mouse/touch UI fully functional** while enabling a voice-only path that can run in a museum installation (no mouse).

---

## Goals

- **Voice-only wizard**: During the `NewMeeting` stage, the system can:
  - Ask the visitor what they want to do (pick a topic, pick foods/characters, add humans).
  - Explain the differences between topics and foods using:
    - `client/src/prompts/topics_*.json`
    - `client/src/prompts/foods_*.json`
  - Drive the UI state **through tools**, not through “LLM guesses”.
- **Seamless handoff**: Once the visitor starts the meeting, the flow hands off to the normal meeting route and the voice guide **tears down**.
- **Key safety**: The **Inworld API key stays server-side**. The browser does **not** receive `INWORLD_API_KEY`.
- **Kiosk survivability**: Reasonable always-on behavior (turn taking, silence handling, reset behavior), with future option for wakeword/button gating.

Non-goals (for now):

- No fully autonomous “meeting moderator” during the council meeting. The guide only runs during `NewMeeting`.
- No long-term memory system/MCP store; the guide can be grounded on the JSON prompts + a small “project description” prompt.

---

## Current status (what’s already done)

### Server: secure WebRTC handshake proxy (✅ complete)

Implemented a server-side proxy so the browser can connect to Inworld Realtime without exposing `INWORLD_API_KEY`:

- `GET /api/voice-guide/ice-servers`
  - Fetches ICE servers from Inworld and returns `{ iceServers }` to the client.
- `POST /api/voice-guide/session`
  - Accepts a raw SDP offer (`Content-Type: application/sdp`) and returns the raw SDP answer from Inworld.

Key files:

- `server/src/api/voiceGuideSession.ts` (new)
- `server/server.ts` wired with `registerVoiceGuideRoutes(app)`
- `server/tests/voiceGuideSession.test.ts` (new, unit tests)

### Client: state lifted for tool-driven selection (✅ complete)

The wizard state is now reducer-driven in `NewMeeting`, while still preserving current UI behavior:

- `client/src/components/NewMeeting.tsx`
  - Introduces a `useReducer` with actions for topic/foods/humans selection.
  - Passes controlled props into `SelectTopic` and `SelectFoods`.
- `client/src/components/settings/SelectTopic.tsx`
  - Added optional controlled-mode props (`selectedTopicId`, `onSelectedTopicIdChange`, `customTopic`, `onCustomTopicChange`).
- `client/src/components/settings/SelectFoods.tsx`
  - Added optional `controls` prop (controlled-mode) and exported helpers:
    - `createBlankHuman(index, lang)`
    - `getFoodsForLanguage(lang)`
    - `MAXHUMANS`

This is the prerequisite for letting the voice guide drive the UI via tool dispatch.

---

## Architecture overview (end state)

### High-level flow

1. **NewMeeting mounts**.
2. Voice guide starts:
   - Requests mic via `getUserMedia`.
   - Establishes WebRTC connection to Inworld Realtime:
     - fetch ICE servers via `GET /api/voice-guide/ice-servers`
     - creates SDP offer locally
     - exchanges SDP via `POST /api/voice-guide/session` (server uses `INWORLD_API_KEY`)
   - Opens a WebRTC **data channel** for events and tool calls.
3. Voice guide:
   - Speaks prompts and listens to visitor speech.
   - Uses tool calls to update the reducer state (topic/foods/humans).
   - When ready, calls a `start_meeting` tool, which triggers the existing `createMeeting` flow.
4. **On navigation to meeting route**:
   - Voice guide is torn down (stop tracks, close peer connection, close channels).

### Trust boundaries / security

- **Server** is the only place that knows `INWORLD_API_KEY`.
- **Client** only gets:
  - ICE server config (safe to expose)
  - SDP answer (safe to expose)
- Audio media stream is client ↔ Inworld media servers after handshake.

### Why the reducer pattern matters

Tools should not “click buttons”; they should **dispatch the same state changes** as the UI. This makes:

- Voice and touch stay in sync.
- Tool calls easy to test (pure reducer transitions).
- UI components remain the single place for visual validation rules.

---

## Migration phases (execute in order)

## Phase 1 — Voice client module (`client/src/voice/`) (pending)

Create a small, testable client voice layer:

### Files

- `client/src/voice/useVoiceGuide.ts`
  - Owns:
    - connection state (`idle | connecting | connected | error`)
    - microphone stream lifecycle
    - `RTCPeerConnection` lifecycle
    - remote audio playback (attach remote track to an `<audio>` element)
    - data channel event loop (tool calls, transcripts/captions)
  - Exposes:
    - `start()` / `stop()`
    - current status + last error
    - last transcript/caption snippet (for overlay)
- `client/src/voice/guidePrompt.ts`
  - Builds the system prompt from:
    - project description (short static string)
    - `topicsBundle` (titles, descriptions)
    - foods bundle (name, description, “character prompt” summary)
  - Must be language-aware (`i18n.language`).
- `client/src/voice/guideTools.ts`
  - Declares:
    - tool schemas (OpenAI Realtime-style)
    - local handlers that dispatch reducer actions

### WebRTC handshake details

- Fetch ICE servers:
  - `GET /api/voice-guide/ice-servers`
  - Set `RTCPeerConnection({ iceServers })`.
- Create offer:
  - add local mic track
  - create data channel (e.g. `"oai-events"` or `"events"`)
  - `createOffer` → `setLocalDescription`
- Exchange offer:
  - `POST /api/voice-guide/session` with the offer SDP as `application/sdp`
  - Set remote description with returned SDP answer.

### Data channel message handling (minimum)

Support parsing events for:

- session/response lifecycle (connected, ready, errors)
- tool calls:
  - function name + JSON args
  - invoke local handler
  - send function result back (if protocol expects it)
- transcripts/captions:
  - keep minimal last-seen caption to display in overlay

---

## Phase 2 — Tool schema + mapping to reducer (pending)

Define a tool set that matches the wizard tasks. Suggested tools:

### Topic step tools

- `list_topics`
  - Returns a short list of topic ids + titles.
- `describe_topic`
  - Args: `{ topicId }`
  - Returns title + description.
- `select_topic`
  - Args: `{ topicId }`
  - Dispatch: `SET_TOPIC_ID`.
- `set_custom_topic`
  - Args: `{ text }`
  - Dispatch: `SET_TOPIC_ID` to custom topic id + `SET_CUSTOM_TOPIC`.
- `confirm_topic`
  - Performs the same operation as clicking “Next”:
    - build a concrete `Topic` object (matching `SelectTopic.buildTopic()` semantics)
    - call the existing `handleTopicContinue(topic)`

### Foods step tools

- `list_foods`
  - Returns available foods (id + name).
- `describe_food`
  - Args: `{ foodId }`
  - Returns food description + a short “character vibe” note.
- `select_food`
  - Args: `{ foodId }`
  - Dispatch: `SELECT_FOOD`.
- `deselect_food`
  - Args: `{ foodId }`
  - Dispatch: `DESELECT_FOOD`.
- `randomize_foods`
  - Dispatch: `SET_SELECTED_FOOD_IDS` with a computed random set (or reuse SelectFoods’ logic by moving it into a shared helper).
- `add_human`
  - Args: none (or optional `{ name?, description? }`)
  - Dispatch: `ADD_HUMAN` (using `createBlankHuman`).
- `update_human`
  - Args: `{ index, name?, description? }`
  - Dispatch: `UPDATE_HUMAN`.
- `start_meeting`
  - Calls the existing `handleFoodsContinue({ foods })` using the same prompt-injection logic as `SelectFoods.continueForward()`.
  - **Important**: ensure voice teardown happens before navigation.

Tool design constraints:

- Tools should be **id-based** (stable IDs), not “click tomato button”.
- Tools should enforce basic validation (unknown ids, index bounds) and return friendly error strings.

---

## Phase 3 — UI overlay and integration into `NewMeeting` (pending)

### `VoiceGuideOverlay` component

Create `client/src/components/VoiceGuideOverlay.tsx` with:

- minimal always-visible indicator:
  - `Listening…` / `Speaking…` / `Thinking…` / `Disconnected`
- last caption line (short)
- “Reset” button (optional; useful for kiosk ops)
- “Mute mic” toggle (optional)

### Integrate into `NewMeeting`

- Mount `VoiceGuideOverlay` only during `NewMeeting`.
- Start the voice guide automatically (always-on for now).
- Pass in:
  - wizard reducer state (for prompt grounding / confirmations)
  - reducer dispatchers (via tool handlers)
  - callbacks:
    - `onConfirmTopic(topic: Topic)`
    - `onStartMeeting(foods: Food[])` (wraps existing flow)

---

## Phase 4 — Kiosk polish (pending, iterative)

Add operational behavior needed in a museum:

- **Always-on vs wake**:
  - Start always-on initially.
  - Add later:
    - wake phrase OR
    - physical “Talk” button OR
    - push-to-talk style input.
- **Silence / idle reset**:
  - If no speech for \(N\) minutes, reset the wizard to the topic step.
  - Show an attract loop prompt (short voice line + overlay hint).
- **Audio processing flags**:
  - `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
- **Debounce short utterances**:
  - avoid tool spam from partial recognition
  - prefer “semantic VAD” / turn detection events
- **Hard reset mechanism**:
  - keyboard hidden in kiosk; provide an on-screen reset, or remote admin route.

---

## Testing strategy

### Unit tests

- Reducer transitions in `NewMeeting` (pure function tests):
  - selecting topic, custom topic text, selecting/deselecting foods, add/update human.
- Tool handlers:
  - validate args; ensure correct dispatch actions.
  - “confirm_topic” produces the correct `Topic` object for both normal and custom topic.
  - “start_meeting” uses the same chair prompt injection semantics as UI.

### Component tests

- `NewMeeting`:
  - voice module mocked; ensure mounting/unmounting tears down resources.
  - tool calls update visible selection state.

### Manual test plan (kiosk-ish)

- Start on topic step with no mouse:
  - guide prompts; user says “I want the climate topic” → selects and confirms.
- On foods step:
  - user says “Add Tomato and Potato” → selections appear, start becomes available.
  - user adds a human named Alice with a description → validation passes.
- Start meeting:
  - `createMeeting` executes, navigation occurs
  - voice guide stops (no background mic, no remote audio).

---

## Observability & debugging

- Add client-side logs gated behind a flag:
  - connection transitions
  - last event type received on data channel
  - tool call names + args (redacting sensitive info; there shouldn’t be any)
- Server logs already use the shared `Logger` and `withNetworkRetry`.

---

## Open questions / follow-ups

- Should the guide allow changing topic after moving to foods step via voice?
  - If yes: add a tool that sets `step` back to `"topic"` and preserves prior selections.
- Do we want a small curated “allowed phrasing” set for museum UX?
  - If yes: encode in prompt as examples (few-shot).
- Should we support multi-language voice selection tied to `i18n.language`?
  - Likely yes; needs mapping between UI language and Inworld voice/locale.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-27 | Added server-side Inworld WebRTC handshake proxy (`/api/voice-guide/*`). |
| 2026-04-27 | Lifted NewMeeting wizard state into a reducer and made `SelectTopic`/`SelectFoods` support controlled-mode props for voice/tool driving. |

