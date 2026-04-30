# Voice Guide (Museum/Kiosk) — migration plan

This document tracks the **intent**, **architecture**, and **implementation status** of the voice-only guide on the **New Meeting** wizard (`client/src/components/NewMeeting.tsx`), using **Inworld realtime speech-to-speech** (OpenAI Realtime–compatible) and **tool calls** to drive the existing React flow.

**How to read this doc:** Sections below distinguish **goals** (still valid), **what shipped** (grounded in the repo today), **gaps** (planned but missing or stubbed), and **design changes** vs earlier assumptions in older revisions of this file.

---

## Goals

- **Voice-only wizard**: During `NewMeeting`, the visitor can pick a topic, foods/characters, and humans using speech; the model uses tools to mutate UI state rather than guessing clicks.
- **Grounding**: Topics and foods come from shared prompt bundles (`shared/prompts/topics_*.json` plus the app-specific character bundle selected via `CHARACTERS_FILE`, loaded via `getTopicsBundle` / `getFoodsBundle`). The system prompt stays short; details are fetched through `describe_topic` / `describe_food` tools (avoids oversized instructions and related realtime failures). The raw Foods bundle keeps its app-specific filename, but its internal participant shape uses the generic `characters` key.
- **Seamless handoff**: After the meeting starts, navigation leaves `NewMeeting`; the voice hook’s **unmount cleanup** should stop mic, peer connection, and data channel (no background realtime session).
- **Key safety**: **`INWORLD_API_KEY` is server-only**; the browser never receives it.
- **Kiosk survivability** (longer term): Turn-taking, silence handling, optional wake/button gating — mostly **not implemented** yet (see Phase 4).

Non-goals (unchanged):

- No voice “moderator” during the live council meeting itself.
- No long-term memory / MCP store for the guide.

---

## Implementation status (authoritative vs this codebase)

### Server — Inworld WebRTC proxy (**done**)

| Route | Role |
|-------|------|
| `GET /api/voice-guide/bootstrap` | Returns `{ iceServers, session }` in **one** round-trip: Inworld ICE (via `getInworldIceServers`) plus a **local** session fragment from `getGlobalOptions()` and chair audio fields from the default character-setup bundle (`characters[0]`). |
| `POST /api/voice-guide/call` | Proxies `{ sdp, session? }` JSON to Inworld `POST /v1/realtime/calls`; returns answer SDP. |

**Removed (superseded by bootstrap):** `GET /api/voice-guide/ice-servers`, `POST /api/voice-guide/realtime-session` — the client no longer calls them.

**Files:** `server/src/api/voiceGuideSession.ts` (session fragment built inline; **`server/src/logic/voiceGuideRealtimeDefaults.ts` does not exist** — that was an earlier plan, not the current tree).

**Tests:** `server/tests/voiceGuideSession.test.ts` exercises `getInworldIceServers` and `createInworldCall` (Inworld-shaped `fetch` mocks), not Express route handlers.

**Global options:** `global-options.json` includes `voiceGuideRealtimeModel`, `voiceGuideRealtimeTranscriptionModel`, and `inworldVoiceModel` (TTS). Older changelog mentions extra voice-guide keys; the **live schema** is what `GlobalOptions.ts` + JSON define today.

---

### Client — voice stack (**done** for core realtime)

| Module | Role |
|--------|------|
| `client/src/voice/useVoiceGuide.ts` | React glue: status, captions/transcripts, auto-start, StrictMode-safe `AbortController` + attempt counter, teardown. |
| `client/src/voice/realtimeConnection.ts` | WebRTC: bootstrap + parallel `getUserMedia`, `RTCPeerConnection` (`iceCandidatePoolSize`), data channel `oai-events`, SDP via `/call`. |
| `client/src/voice/realtimeEventLoop.ts` | Data-channel events: `session.update` / `session.updated`, gated `response.create`, synthetic **user** `conversation.item.create` before the opening greeting (required for some models), tool call dispatch via fresh `handlersRef`. |
| `client/src/voice/realtimeProtocol.ts` | Types + `mergeVoiceGuideRealtimeSession`. |
| `client/src/voice/guidePrompt.ts` | Builds instructions from base JSON prompt + topic/food id lists (no long inlined descriptions). |
| `client/src/voice/guideTools.ts` | Tool **schemas** + **handlers** for the wizard (see gaps below). |

**Observability:** Debug logging is gated by `localStorage.voiceGuideDebug` (`"1"` / `"verbose"`) in `useVoiceGuide`.

---

### Client — New Meeting integration (**partial**)

- **`NewMeeting.tsx`** wires `useVoiceGuide`, `buildGuidePrompt`, `createGuideTools` / `createGuideToolHandlers`, and **`VoiceGuideOverlay`** on both topic and foods steps.
- **Wizard state** is implemented with **`useState` lifts** (`selectedTopic`, `customTopic`, `selectedFoods`, `humans`, …), **not** a `useReducer` as originally sketched in this plan. Functionally the same idea (single source of truth for UI + voice); the doc previously overstated “reducer-driven.”
- **`start_meeting`:** Implemented — `buildMeetingFoodsPayload` in `SelectFoods.tsx` shares validation + chair prompt injection with the Start button; `guideTools` calls `handleFoodsContinue` via `startMeeting` when `meetingStep === "foods"`.
- **Still missing vs original Phase 2 sketch:** `randomize_foods`, `add_human`, `update_human` (humans can still be added via UI; voice tools for them are not exposed).

---

### `VoiceGuideOverlay` (**partial**)

**File:** `client/src/components/VoiceGuideOverlay.tsx`

**Shipped:** Fixed corner panel; status pill (idle / connecting / listening / error); Start/Stop; last user transcript and guide caption; error line.

**Not shipped** (still nice-to-haves from the original overlay spec): explicit “Speaking / Thinking” states, Reset, Mute mic.

---

### Phase 4 — Kiosk polish (**not started**)

Wake word, idle reset, attract loop, debounce tuning beyond semantic VAD, dedicated hard-reset UX — **not** implemented in code reviewed for this update.

---

### Testing (**partial**)

| Area | Status |
|------|--------|
| `client/tests/unit/voice/realtimeEventLoop.test.ts` | Covers greeting gating, no stacked `response.create`, tool dispatch via `getCtx`. |
| `client/tests/unit/voice/realtimeProtocol.test.ts` | Protocol/types. |
| Reducer / tool-handler unit tests (as described in older “Testing strategy”) | **Not** present as named; `NewMeeting.creatorKey.test.tsx` focuses on meeting key handoff, not voice tools. |

---

## Architecture (current end-to-end flow)

1. **`NewMeeting` mounts** → `useVoiceGuide` auto-starts (unless disabled).
2. **Parallel:** `GET /api/voice-guide/bootstrap` and **`getUserMedia`** (`Promise.allSettled` with cleanup if bootstrap fails).
3. **WebRTC:** Build merged `session` (server defaults + client `instructions` + `tools`), create offer, **`POST /api/voice-guide/call`**, `setRemoteDescription`, wait for ICE + data channel open.
4. **Data channel:** On open, send **`session.update`** with full config; wait for **`session.updated`**; send synthetic **user** `conversation.item.create` + **`response.create`** for opening greeting.
5. **Runtime:** Semantic VAD + tool calls update React state via handlers; captions/transcripts feed the overlay.
6. **Teardown:** Hook `cleanup` on unmount (StrictMode-safe) closes PC, stops tracks, clears refs.

**Trust model:** unchanged — only the app server holds `INWORLD_API_KEY`; media goes browser ↔ Inworld after handshake.

---

## Design decisions (evolved since first draft)

1. **`session.update` on the data channel is required** for tools/instructions; relying on `/call` body alone caused `server_error` / missing tools. The session in `/call` is still sent as a merged snapshot for Inworld’s handshake, but the **canonical** tool+instruction registration is the DC `session.update` after the channel opens.
2. **Opening greeting** needs a minimal **user** turn before the first `response.create` for some models (e.g. Gemini path).
3. **Bootstrap endpoint** replaces separate ICE + realtime-session fetches for fewer RTTs; mic acquisition runs in parallel with bootstrap.
4. **Prompt shape:** Short system prompt + tool-backed `describe_*` instead of inlining all topic/food text (stability + token limits).

---

## Open questions / follow-ups

- Should the guide allow changing topic after moving to foods (voice “go back”)?
- Curated phrasing / few-shot examples for museum UX?
- Multi-language voice/TTS alignment with `i18n.language` beyond current text bundles?
- Add voice tools for **`add_human` / `update_human`** / **`randomize_foods`** if full kiosk voice-only coverage is required.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-27 | Added server-side Inworld WebRTC handshake proxy (`/api/voice-guide/*`). |
| 2026-04-27 | Lifted NewMeeting wizard state for voice/tool driving; `SelectTopic` / `SelectFoods` controlled-mode props. |
| 2026-04-27 | Split client voice into `realtimeConnection.ts`, `realtimeEventLoop.ts`, `useVoiceGuide.ts`; VAD eagerness `medium`; short prompt + describe tools; `handlersRef` for fresh tool closures. |
| 2026-04-27 | StrictMode-safe start (`AbortController` + attempt counter); auto-start inside hook; ICE gather timeout tightened. |
| 2026-04-27 | Restored **`session.update`** over the data channel; gated opening `response.create` on `session.updated`; added `realtimeEventLoop` unit tests. |
| 2026-04-27 | Tightened `voiceGuideSession` proxy; removed unused session route; `inworldFetch` helper. |
| 2026-04-27 | `voiceGuideRealtimeModel` + `voiceGuideRealtimeTranscriptionModel` in `global-options.json`; client merges session for `/call` + `session.update`. |
| 2026-04-28 | **`GET /api/voice-guide/bootstrap`** replaces separate ICE + realtime-session client calls; parallel `getUserMedia`; `iceCandidatePoolSize`; opening greeting uses synthetic user item before `response.create`. |
| 2026-04-28 | Removed redundant **`ice-servers`** and **`realtime-session`** HTTP routes; doc updated to match (**this revision**). |
| 2026-04-28 | Voice **`start_meeting`** tool + shared **`buildMeetingFoodsPayload`** (same path as SelectFoods Start / `handleFoodsContinue`). |
