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

### Tail sanitizer (replay manifest + resume)

Repeatedly **pop** the **last** message from the **slice copy** while its **`type`** is one of:

- `invitation`
- `awaiting_human_question`
- `awaiting_human_panelist`

Stop when the tail is not one of these or the array is empty. **Do not** remove these types from the middle of the stack.

The same sanitizer is used for both the replay manifest and the Phase 8 resume path (see `buildResumeConversation`).

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

## Phase 8 — `PUT /api/meetings/:meetingId` re-open (server) ✅

**Why:** A replay client that reaches **`meeting_incomplete`** can offer the user a "resume this meeting" action. The request is public (anyone with the id may try), but only allowed when **no other live session** holds the meeting and the meeting has **no** `summary` yet. On success the server issues a fresh **`creatorKey`** and returns the full updated meeting so the client can reconcile any messages that landed after its replay `GET` but before this `PUT`.

### HTTP shape

| Endpoint | Auth | Body | Purpose |
|----------|------|------|---------|
| `PUT /api/meetings/:meetingId` | **None** | empty / `{}` | Re-open an incomplete meeting; rotate `creatorKey`; return full meeting |

**200 OK** — `ResumeMeetingResponse = { meeting: Meeting; creatorKey: string }` (the `meeting` uses the public `Meeting` shape — **no** `creatorKey` field; the secret comes back in the sibling field so storage paths stay symmetrical with `POST /api/meetings`).

**Errors:**
- **400** `BadRequestError` — malformed id **or** meeting already has `summary` (MeetingAlreadyComplete).
- **404** `NotFoundError` — meeting does not exist.
- **409** `LiveSessionConflictError` — another live session currently holds the meeting in **`liveSessionRegistry`**. Reuse the exact string **`This meeting is happening somewhere else`** (same message as `start_conversation` conflict) so the client has **one** i18n string to display.

> Note: 409 is a new `ConflictError` class (subclass of `ApiError`); add mapping in `meetingRoutes.ts`' `apiRouteWithErrorHandling`.

### Live-lock check

Add to `liveSessionRegistry.ts`:

```ts
export function hasLiveSession(meetingId: number): boolean {
    return liveSessions.has(meetingId);
}
```

### Sanitization — shared with replay

Extract a shared helper in `replayManifest.ts`:

```ts
/** Sliced + audio-truncated + tail-stripped conversation (no synthetic `meeting_incomplete`). */
export function buildResumeConversation(meeting: StoredMeeting): Message[] {
    const sliced = sliceConversation(meeting);
    const truncated = truncateToAvailableAudio(sliced, meeting.audio);
    stripAwaitingHumanTail(truncated);
    return truncated;
}
```

`buildReplayMeetingManifest` keeps its current behavior (slice → truncate → tail-strip → append `meeting_incomplete` when no `summary`), but refactored to call `buildResumeConversation` for the first three steps. This is the **single source of truth** for "what does a half-finished meeting look like once sanitized" — so the replay client and a resumed meeting agree.

### Server algorithm (`server/src/api/resumeMeeting.ts`)

```
export async function resumeMeeting(meetingId: number): Promise<ResumeMeetingResponse>
```

1. `const stored = await getMeetingById(meetingId)` — throws `NotFoundError`.
2. If `stored.summary` exists → throw `BadRequestError("MeetingAlreadyComplete")`.
3. If `hasLiveSession(meetingId)` → throw `ConflictError(LIVE_SESSION_CONFLICT_MESSAGE)`.
4. `const conversation = buildResumeConversation(stored)`.
5. `const newCreatorKey = uuidv4()`.
6. Trim `audio` to the ids still referenced by the sanitized `conversation` (prevents orphan ids from accumulating; a future cleanup pass will also remove the `audioCollection` rows themselves — out of scope here).
7. `updateOne` with optimistic filter:
   ```ts
   const r = await meetingsCollection.updateOne(
     { _id: meetingId, summary: { $exists: false } },
     {
       $set: {
         creatorKey: newCreatorKey,
         conversation,
         audio: trimmedAudio,
         state: { alreadyInvited: false },
         maximumPlayedIndex: conversation.length > 0 ? conversation.length - 1 : 0,
       },
     }
   );
   if (r.matchedCount !== 1) throw new BadRequestError("MeetingAlreadyComplete");
   ```
8. `const updated = await getMeeting(meetingId, newCreatorKey)` — reuses the creator-GET path, which strips `creatorKey` and returns a public `Meeting`.
9. Return `{ meeting: updated, creatorKey: newCreatorKey }`.

### Unification of start / resume / reconnect (observation)

All three entrypoints converge on the same runtime path: load meeting → validate `creatorKey` → attach to `MeetingManager` → `startLoop()` picks up from `conversation` as it stands in DB. `attempt_reconnection` additionally regenerates any missing audio and applies client-side playback options (`handRaised`, `conversationMaxLength`). For resume we pre-sanitize the conversation via `buildResumeConversation` so no audio is missing when `start_conversation` arrives, and the new `creatorKey` prevents a second live session from racing ahead. Full collapse of `handleStartConversation` into `handleReconnection` is a follow-up refactor (error-handling divergence with existing tests) and not required for Phase 8.

### Race windows (accepted)

| Window | Outcome | Mitigation |
|--------|---------|------------|
| A live session starts between step 3 and step 6 | Live session had the **old** `creatorKey`; after step 6 it no longer matches the stored `creatorKey`, so the socket will disconnect at its next auth check (or fail on reconnect). | Acceptable; symmetric with our server-restart stance in Phase 3. |
| Two PUTs for the same meeting interleave | The optimistic filter on step 6 and the later `start_conversation` creator-key check guarantee at most one caller wins: second caller writes a second `creatorKey` and races to connect; loser's creator key is no longer valid. | Acceptable; we log WARN. |
| The live loop is currently *generating* audio for the last message when we resume | `truncateToAvailableAudio` drops that tail message, so the new conversation stops at the last message with audio on disk. | Already implemented in the helper. |

### Multi-process caveat

`liveSessionRegistry` is **process-local**. A multi-process deployment would let two processes resume concurrently. Same caveat as Phase 3; revisit if/when we add Redis.

### Tests (`server/tests/resumeMeeting.test.ts` + integration)

- Unit:
  - 404 when meeting missing.
  - 400 `MeetingAlreadyComplete` when `summary` present.
  - 409 when `liveSessionRegistry.hasLiveSession` is true.
  - Happy path:
    - rotates `creatorKey` (different from before; old key no longer valid in DB);
    - persists sanitized `conversation` (tail-stripped incl. `invitation`, truncated to available audio, capped by previous `maximumPlayedIndex`);
    - trims `audio` to ids referenced by sanitized `conversation`;
    - resets `state` to `{ alreadyInvited: false }` (drops any pending `humanName`);
    - sets `maximumPlayedIndex = conversation.length - 1` (0 when empty);
    - response `meeting` has **no** `creatorKey` and matches DB contents.
  - Legacy doc (no `maximumPlayedIndex`): uses full conversation prior to audio-truncation / tail-strip.
- Integration (`meetingsHttpAndSocket.integration.test.js`):
  - PUT returns 200 + new key; POST `start_conversation` with old key fails; with new key succeeds; live loop resumes without recreating already-delivered messages.

**Verify:** curl public PUT on a half-finished meeting → 200 with new `creatorKey` + cleaned `meeting`; second PUT while a socket is live → 409; PUT on a meeting with summary → 400.

---

## Phase 9 — Client resume flow ✅

**When:** Replay client reaches the synthetic `meeting_incomplete` message (Phase 6 state/overlay).

**Implemented:**

1. Overlay: the `"incomplete"` overlay (`components/overlays/Incomplete.tsx`) now exposes `isResuming` (disables the resume button while the PUT is in-flight) and a categorised `resumeError` prop. A `dismissResumeError` callback clears the error on retry.
2. On confirm: `useCouncilMachine.handleOnAttemptResume` calls `resumeMeeting({ meetingId })` (`client/src/api/resumeMeeting.ts`). The API throws a typed `ResumeMeetingError` carrying the HTTP status so callers can branch without string-matching.
3. On **200**:
   1. Reconcile the local buffer against `response.meeting.conversation`:
      - drop the synthetic `meeting_incomplete` sentinel from `textMessages`;
      - append any server-side messages whose `id` isn't already present (append-only — the server's conversation is ≥ ours because both sides run the same sanitiser and the replay GET was capped by `maximumPlayedIndex`).
   2. Prefetch audio for any ids in `response.meeting.audio` we don't already hold, using the existing `decodeReplayClip` helper with bounded concurrency (batch size 6).
   3. Cap `meetingMaxLength`/`maximumPlayedIndex` to the new conversation length so the FSM allows playback through it; live socket will push the ceiling further when new messages arrive.
   4. Close the overlay, set `playNextIndex = playingNowIndex + 1`, and transition FSM to `loading` — the next `tryToFindTextAndAudio()` check will flip it back to `playing`.
   5. Call the lifted `setCreatorKey(response.creatorKey)` (new `Council` prop, wired through `Main.tsx`). `useCouncilSocket` is keyed on `creatorKey`, so a fresh socket opens and emits `start_conversation`. The server reads the sanitized `conversation` from DB, so there is no message duplication.
4. Errors (categorised as `"conflict" | "complete" | "notfound" | "generic"` in `resumeError`, rendered via `incomplete.error.*` i18n keys):
   - **409** → `conflict` → "This meeting is currently happening somewhere else." `setCreatorKey` is *not* called.
   - **400** `MeetingAlreadyComplete` → `complete` → "This meeting has already been wrapped up." (Full refetch of the public manifest is a future enhancement; for now the overlay surfaces the copy and the user can close it.)
   - **404** → `notfound` → "We couldn't find this meeting anymore."
   - Anything else → `generic` → "Something went wrong — please try again."
5. The resume button is disabled while `isResuming === true`. Re-entry is guarded by the same flag.
6. Replay bootstrap effect in `useCouncilMachine` already early-returns when `creatorKey` is defined, so flipping the key causes the in-flight prefetch to clean up via its AbortController and ownership passes to the socket path.

### Tests

- `client/tests/unit/api/resumeMeeting.test.ts` — request shape, 200 parsing, status preservation in `ResumeMeetingError` for 400/404/409, non-JSON fallback.
- `client/tests/unit/hooks/useCouncilMachine.test.tsx` — resume flow:
  - 200 calls `setCreatorKey` with the rotated key and drops the synthetic from `textMessages`;
  - 200 appends server-only messages (race where server raced past the replay GET);
  - 409/400/404/other map to `conflict` / `complete` / `notfound` / `generic`; `setCreatorKey` is not invoked on error;
  - `dismissResumeError` clears the error.
- `client/tests/unit/components/overlays/Incomplete.test.tsx` — disabled state while resuming, i18n'd error display, retry dismisses prior error.

**Verify:** Replay URL → reach `meeting_incomplete` → click Resume → overlay closes → new socket opens (`creatorKey` populated) → loop continues without duplicating messages.

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
| — | 8 | `PUT /api/meetings/:meetingId` server: `resumeMeeting` rotates `creatorKey`, shares `buildResumeConversation` with replay (slice → audio-truncate → strip invitation + awaiting-human tail), trims `audio` to surviving ids, resets `state`, sets `maximumPlayedIndex = length-1`. New `ConflictError` → 409; `hasLiveSession` helper on the registry. Unit + integration tests; full suite green. |
| — | 8.1 | Cleanup: `ConversationState.humanName` narrowed to `string \| undefined` (single representation); `createMeeting`/`resumeMeeting` no longer write `humanName: null`; `HumanInputHandler` drops the `?? undefined` fallback. `LIVE_SESSION_CONFLICT_MESSAGE` constant removed — the literal lives at its three callsites (2× `SocketManager`, 1× `resumeMeeting`). |
| — | 9 | Client resume flow: typed `ResumeMeetingError` (status-aware); `useCouncilMachine.handleOnAttemptResume` reconciles against `response.meeting`, prefetches any missing audio, flips mode via lifted `setCreatorKey`. `Incomplete` overlay gains in-flight disabled state + categorised i18n errors (`conflict`/`complete`/`notfound`/`generic`). Hook + api + overlay tests added; pre-existing `Council.test.tsx` / `CouncilOverlays.test.tsx` prop-shape gaps also fixed. Client suite: 202/202. |
