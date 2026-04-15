# Meeting replay and live exclusivity — implementation plan

This document is the **single source of truth** for the replay/live meeting work. Execute **one phase at a time** and run the **manual verification** for that phase before starting the next.

---

## Goals (summary)

- **Live**: One WebSocket-driven session per meeting at a time; **`maximumPlayedIndex`** advances **only** over that socket and is stored in MongoDB (**`$max`**).
- **Replay**: **Public** manifest (`GET /api/meetings/:id` without auth) + **public** per-clip audio (`GET /api/audio/:audioId`); client loads clips in **conversation order** (first clip first for short time-to-start, then the rest in parallel or a small queue — see **Replay audio prefetch**).
- **Half-finished meetings**: Synthetic **`meeting_incomplete`** message on the manifest tail when there is no **`summary`**; client **Incomplete** state (complete-meeting action stubbed until re-open/PUT exists).
- **Server restart**: In-memory live lock is lost; **`attempt_reconnection`** with **`creatorKey`** check may fail and the client may error — **acceptable** until Redis/TTL later.

---

## Phase 0 — Contracts (frozen for implementation)

These choices avoid thrash between server and client. **Change them here first**, then code.

### `maximumPlayedIndex` (Mongo + manifest)

- **Client source of truth**: The same **`maximumPlayedIndex`** state already tracked in **`client/src/hooks/useCouncilMachine.ts`** (updated when **`playingNowIndex`** exceeds the previous max) is the value the **live** client sends to the server and the server persists. No separate client-side definition.
- **Meaning**: Greatest **0-based index** into the meeting’s persisted **`conversation`** array that the **live creator session** has **reached** in playback — aligned with that hook’s semantics relative to **`playingNowIndex`** / conversation indices when emitted over the socket (Phase 4).
- **Replay slice**: The manifest **`conversation`** array returned to clients is **`storedConversation.slice(0, maximumPlayedIndex + 1)`** — **inclusive** of `maximumPlayedIndex`. If that would be empty and the field is **missing**, see default below.
- **Default when field is absent or `null`** (legacy meetings): Treat as **no artificial cap**: use the **full** `storedConversation` for slicing purposes, i.e. same as **`maximumPlayedIndex = storedConversation.length - 1`** after any non-destructive prep, **before** tail sanitization and synthetic append (so legacy = “full history” subject to sanitizer + incomplete tail).
- **Monotonicity**: Server updates only via **`$max: { maximumPlayedIndex: newIndex }`** so retries never shrink the cap.

### `audio` array on the meeting document (manifest)

- **`Meeting.audio`**: List of **message ids** that have associated rows in **`audioCollection`** (existing convention).
- **Replay manifest alignment**: After the **`conversation`** slice is computed, the manifest’s **`audio`** field MUST list **only** those audio ids whose **message id** appears on a **non-synthetic** message in the **sliced** conversation (and typically only types that actually have TTS audio — document exceptions here if any). The manifest SHOULD expose ids in **the same order as messages appear in `conversation`** (for each message that has audio, in sequence) so the client can prefetch in conversation order.

### Tail sanitizer (replay manifest only)

Repeatedly **pop** the **last** message from the **slice copy** while its **`type`** is one of:

- `awaiting_human_question`
- `awaiting_human_panelist`

Stop when the tail is not one of these or the array is empty. **Do not** remove these types from the middle of the stack.

### Synthetic incomplete message

- **When**: Persisted meeting has **no** **`summary`** (and optionally other “completed” signals later).
- **Shape**: Append a single synthetic **`Message`** at the end of the **returned** manifest only (default: **not** persisted), e.g.:

```ts
{ type: "meeting_incomplete", id: "meeting_incomplete" }
```

(`id` fixed for deduping and tests; adjust if it collides with real UUIDs — extremely unlikely.)

### HTTP shapes

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/meetings/:meetingId` | None | **Replay manifest** (sliced, sanitized, no `creatorKey`) |
| `GET /api/meetings/:meetingId` | `Authorization: Bearer <creatorKey>` | **Creator** fetch (full or creator view; may share builder with replay branch) |
| `GET /api/audio/:audioId` | None | Single clip as **`application/json`** (`PublicAudioClipResponse`: **`audioBase64`** + **`sentences`** + **`id`**); **Cache-Control** + **ETag** for CDN |

### Socket: live registry + progress (names to implement in later phases)

- **Live lock**: In-memory **`Map<meetingId, { creatorKey: string; socketId: string }>`** (or equivalent). Second **`start_conversation`** for same meeting → error to client, message: **`This meeting is happening somewhere else`** (exact string for UI/i18n if needed).
- **Progress event (C2S)**: **`report_maximum_played_index`** with payload **`{ index: number }`** (meeting inferred from session). Handler: only if this socket holds the live lock for that meeting; then **`$max: { maximumPlayedIndex: index }`** on the meeting document. **`index`** must lie in **`0 .. conversation.length - 1`**.

### Public audio URLs and caching

- Ids are **not secret**; security model for public replay is **“anyone with the id can fetch”**.
- Prefer **`Cache-Control: public, max-age=…`** and **`immutable`** if bytes at that id never change, so **Cloudflare** can cache. **Nonces** in URLs are **not** required for this model and would complicate caching.

### Client modes (reference)

- **`live_creator`**: Socket on, may emit **`report_maximum_played_index`**, full controls where allowed.
- **`replay`**: Public manifest + **`GET /api/audio/:id`** per clip; **no** socket emits; no raise-hand / human continuation.

### Replay audio prefetch (client, Phase 5)

- After the manifest is loaded, derive the ordered list of **message ids** that have audio (**conversation order**).
- **First clip**: `GET` the first id **before** or **without waiting for** the rest, so **time-to-first-playable-message** stays short.
- **Remaining clips**: Fetch the rest in **conversation order** using either **parallel** requests (bounded concurrency, e.g. 4–8) or a **small client queue** (e.g. pipeline the next 2–3 while playback runs). Pick one implementation and tune later; both satisfy “reasonable” load after the first byte.

---

## Phase 1 — `GET /api/audio/:audioId` (public)

**Do:** Implement route; load `audioCollection` by `_id`; 404 if missing or empty payload; respond with **`PublicAudioClipResponse`** JSON (**`audioBase64`**); **`Cache-Control: public, max-age=86400, immutable`**; **ETag** (SHA-256 of audio bytes) with **304** on **`If-None-Match`**.

**Verify:** Known id → **200** + JSON + **`Cache-Control`**; base64 decodes to stored bytes; unknown id → **404**; repeat GET with **`If-None-Match`** → **304**.

---

## Phase 2 — Replay manifest on `GET /api/meetings/:id` ✅

**Do:** No Bearer → replay DTO (slice, tail sanitizer, strip `creatorKey`, align `audio`, append `meeting_incomplete` when no summary). Bearer + creator → full stored meeting (includes `creatorKey`, optional `maximumPlayedIndex`).

**Verify:** curl public vs Bearer; no secret leakage; `audio` matches slice.

---

## Phase 3 — In-memory one live session per meeting ✅

**Do:** Map on `start_conversation`; reject second session with agreed message; cleanup on disconnect; `attempt_reconnection` validates `creatorKey`; restart → acceptable failure.

**Verify:** Two browsers conflict; disconnect frees slot; reconnect after restart behavior as agreed.

---

## Phase 4 — Socket-only `maximumPlayedIndex` (`report_maximum_played_index`) ✅

**Do:** C2S handler + `$max` update + in-memory **`meeting.maximumPlayedIndex`** local max; live client debounced emit of **`max(maximumPlayedIndex, playingNowIndex)`** when **`playingNowIndex >= 0`** (400 ms debounce, so burst coalescing does not regress the cap after skip-back within the window).

**Verify:** DB field moves with live play; replay GET reflects cap.

---

## Phase 5 — Client replay path ✅

**Do:** Council without `creatorKey` loads public manifest; `useCouncilMachine` replay mode; prefetch audio in **conversation order** (first clip prioritized, then remainder per **Replay audio prefetch** above); disable hand/human.

**Verify:** Incognito URL plays; network shows manifest then first **`/api/audio/...`** quickly; no conversation socket.

---

## Phase 6 — `meeting_incomplete` UI

**Do:** FSM + overlay; stub “complete now” until PUT re-open exists.

**Verify:** No-summary meeting shows incomplete state; no crash at end.

---

## Phase 7 — Tests and hardening

**Do:** Integration tests for public GET meeting, registry, `$max`, optional reconnect; client tests for replay bootstrap and incomplete. (Audio route covered in Phase 1 tests.)

**Verify:** CI green.

---

## Changelog

| Date | Phase | Notes |
|------|-------|-------|
| (init) | 0 | Contracts written; no runtime code required for Phase 0 beyond this file. |
| — | 1 | `GET /api/audio/:audioId` + `PublicAudioClipResponse`; doc edits (no live_spectator; `maximumPlayedIndex` = hook value; prefetch order). |
| — | 2 | Public replay `GET /api/meetings/:id` (`buildReplayMeetingManifest`, `ReplayMeetingManifest`); creator GET unchanged + optional `maximumPlayedIndex`. |
| — | 3 | `liveSessionRegistry` + `SocketManager` acquire/release; `ReconnectionOptions.creatorKey`; `ConnectionHandler` 403; integration tests. |
| — | 4 | `report_maximum_played_index` + Mongo `$max`; `socketHoldsLiveSession`; client debounced emit on `playingNowIndex`. |
| — | 5 | Public manifest bootstrap in `Council.tsx`; `getPublicMeeting`; replay prefetch + FSM (`meeting_incomplete`, no socket emits); `HumanInput` gated on `creatorKey`. |
