# Meeting replay and live exclusivity — implementation plan

This document is the **single source of truth** for the replay/live meeting work. Execute **one phase at a time** and run the **manual verification** for that phase before starting the next.

---

## Goals (summary)

- **Live**: One WebSocket-driven session per meeting at a time; **`maximumPlayedIndex`** advances **only** over that socket and is stored in MongoDB (**`$max`**).
- **Replay**: **Public** manifest (`GET /api/meetings/:id` without auth) + **public** per-clip audio (`GET /api/audio/:audioId`), parallel fetches on the client (~10–15 max).
- **Half-finished meetings**: Synthetic **`meeting_incomplete`** message on the manifest tail when there is no **`summary`**; client **Incomplete** state (complete-meeting action stubbed until re-open/PUT exists).
- **Live spectators** (optional later): Snapshot manifest + audio at load; **reload** to see more; no mid-session manifest growth (see phases).
- **Server restart**: In-memory live lock is lost; **`attempt_reconnection`** with **`creatorKey`** check may fail and the client may error — **acceptable** until Redis/TTL later.

---

## Phase 0 — Contracts (frozen for implementation)

These choices avoid thrash between server and client. **Change them here first**, then code.

### `maximumPlayedIndex` (Mongo + manifest)

- **Meaning**: Greatest **0-based index** into the meeting’s persisted **`conversation`** array that the **live creator session** has **entered as the current playback position** (aligned with client **`playingNowIndex`** when it advances during live play — i.e. “furthest message the live session has reached”).
- **Replay slice**: The manifest **`conversation`** array returned to clients is **`storedConversation.slice(0, maximumPlayedIndex + 1)`** — **inclusive** of `maximumPlayedIndex`. If that would be empty and the field is **missing**, see default below.
- **Default when field is absent or `null`** (legacy meetings): Treat as **no artificial cap**: use the **full** `storedConversation` for slicing purposes, i.e. same as **`maximumPlayedIndex = storedConversation.length - 1`** after any non-destructive prep, **before** tail sanitization and synthetic append (so legacy = “full history” subject to sanitizer + incomplete tail).
- **Monotonicity**: Server updates only via **`$max: { maximumPlayedIndex: newIndex }`** so retries never shrink the cap.

### `audio` array on the meeting document (manifest)

- **`Meeting.audio`**: List of **message ids** that have associated rows in **`audioCollection`** (existing convention).
- **Replay manifest alignment**: After the **`conversation`** slice is computed, the manifest’s **`audio`** field MUST list **only** those audio ids whose **message id** appears on a **non-synthetic** message in the **sliced** conversation (and typically only types that actually have TTS audio — document exceptions here if any). Order can match message order in the slice or be sorted; **client should treat it as a set** for prefetch unless we later guarantee order.

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
| `GET /api/audio/:audioId` | None | Single clip; **Cache-Control** friendly for CDN |

### Socket: live registry + progress (names to implement in later phases)

- **Live lock**: In-memory **`Map<meetingId, { creatorKey: string; socketId: string }>`** (or equivalent). Second **`start_conversation`** for same meeting → error to client, message: **`This meeting is happening somewhere else`** (exact string for UI/i18n if needed).
- **Progress event (C2S)**: **`report_maximum_played_index`** with payload **`{ index: number }`** (meeting inferred from session). Handler: only if this socket holds the live lock for that meeting and **`creatorKey`** matches the meeting document; then **`$max`** persist.

### Public audio URLs and caching

- Ids are **not secret**; security model for public replay is **“anyone with the id can fetch”**.
- Prefer **`Cache-Control: public, max-age=…`** and **`immutable`** if bytes at that id never change, so **Cloudflare** can cache. **Nonces** in URLs are **not** required for this model and would complicate caching.

### Client modes (reference)

- **`live_creator`**: Socket on, may emit **`report_maximum_played_index`**, full controls where allowed.
- **`replay`**: Public manifest + parallel **`GET /api/audio/:id`**; **no** socket emits; no raise-hand / human continuation.

---

## Phase 1 — `GET /api/audio/:audioId` (public)

**Do:** Implement route; load `audioCollection` by `_id`; 404 if missing; correct content type; cache headers per Phase 0.

**Verify:** Known id → 200 + playable file; unknown → 304/200 behavior if ETag added; CF cache smoke test optional.

---

## Phase 2 — Replay manifest on `GET /api/meetings/:id`

**Do:** No Bearer → replay DTO (slice, tail sanitizer, strip `creatorKey`, align `audio`, append `meeting_incomplete` when no summary). Bearer + creator → existing / creator view.

**Verify:** curl public vs Bearer; no secret leakage; `audio` matches slice.

---

## Phase 3 — In-memory one live session per meeting

**Do:** Map on `start_conversation`; reject second session with agreed message; cleanup on disconnect; `attempt_reconnection` validates `creatorKey`; restart → acceptable failure.

**Verify:** Two browsers conflict; disconnect frees slot; reconnect after restart behavior as agreed.

---

## Phase 4 — Socket-only `maximumPlayedIndex` (`report_maximum_played_index`)

**Do:** C2S handler + `$max` update; live client debounced emit on playback advance.

**Verify:** DB field moves with live play; replay GET reflects cap.

---

## Phase 5 — Client replay path

**Do:** Council without `creatorKey` loads public manifest; `useCouncilMachine` replay mode; parallel audio prefetch; disable hand/human.

**Verify:** Incognito URL plays; network shows manifest + N audio, no conversation socket.

---

## Phase 6 — `meeting_incomplete` UI

**Do:** FSM + overlay; stub “complete now” until PUT re-open exists.

**Verify:** No-summary meeting shows incomplete state; no crash at end.

---

## Phase 7 — Live spectator snapshot (optional)

**Do:** Only if needed in same release as replay.

**Verify:** Reload after creator advances cap shows longer manifest.

---

## Phase 8 — Tests and hardening

**Do:** Integration tests for audio route, public GET, registry, `$max`, optional reconnect; client tests for replay bootstrap and incomplete.

**Verify:** CI green.

---

## Changelog

| Date | Phase | Notes |
|------|-------|-------|
| (init) | 0 | Contracts written; no runtime code required for Phase 0 beyond this file. |
