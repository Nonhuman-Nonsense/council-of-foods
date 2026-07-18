# Museum kiosk resilience — PR 1.5 plan

**Parent:** [museum-kiosk-resilience-plan.md](./museum-kiosk-resilience-plan.md)

**Depends on:** [museum-kiosk-resilience-pr1.md](./museum-kiosk-resilience-pr1.md) (probe-before-reload — shipped)

**Goal:** Two small follow-ups from PR 1 field use:

1. **Don’t run autoplay timers while system error overlays are up.**
2. **Simplify health probing** — same behavior, less `AbortController` plumbing.

**Status:** Implemented.

---

## 1. Pause autoplay during errors

### Problem

Three overlays can be active at once:

| Overlay | Trigger | Timer |
|---------|---------|--------|
| `AutoplayWarning` | `phase === "warning"` | `AutoButton` 20s → auto-starts meeting |
| `Reconnecting` | `connectionError` | delay, then probe loop |
| `CouncilError` | `unrecoverableError` | `AutoButton` 10s restart |

All use `layer="system"` (`z.systemOverlay`). `Main.tsx` paints error overlays **after**
`AutoplayCoordinator`, so errors sit on top — but `AutoplayWarning` can stay mounted
underneath with its countdown still running. That can call `enterAutoplay()` while
reconnect or error UI is showing.

### What PR 1 already does

In `AutoplayCoordinator.tsx`:

- Idle watch stops when `connectionError` is set (no *new* warnings).
- Summary → next-meeting timer stops when `connectionError` is set.

### Gaps

1. **`unrecoverableError` is never checked** — idle watch and summary loop ignore it.
2. **An existing warning is not cleared** — when `phase === "warning"`, idle watch
   returns early with `phase_not_off` before the `connectionError` check matters.
   `AutoplayWarning` + `AutoButton` keep ticking.
3. **Render is not gated** — `{phase === "warning" && <AutoplayWarning />}` does not
   check error state.

### Fix (single file: `AutoplayCoordinator.tsx`)

**Gate**

```ts
const unrecoverableError = useErrorStore((s) => s.unrecoverableError);
const systemBlocked = connectionError != null || unrecoverableError != null;
```

**Suspend when blocked**

New `useEffect` on `systemBlocked`:

- When `systemBlocked` becomes true and `phase === "warning"` → `setPhase("off")`,
  log e.g. `AUTOPLAY warning cleared — system error`.
- When `systemBlocked` becomes false → `bumpAutoplayActivity("error-cleared")` so idle
  does not fire immediately after recovery.

**Extend existing guards**

| Effect | Change |
|--------|--------|
| Idle watch | Early return + `logIdleInactive("system_error")` when `systemBlocked` |
| Summary loop | Early return when `systemBlocked` |
| Render | `{phase === "warning" && !systemBlocked && <AutoplayWarning … />}` |

Extend `IdleInactiveReason` with `"system_error"` (replaces separate
`connection_error` in logs, or keep both — one combined reason is enough).

### Out of scope

- **`AutoButton` / `AutoplayWarning`** — unmounting the warning stops its timer.
- **`phase === "active"`** — hardware exit + `exitAutoplay` unchanged; only the idle
  warning overlap is the bug.
- **`errorStore` / `Main.tsx`** — no new fields.

### Tests (`AutoplayCoordinator.test.tsx`)

1. Idle on `/` with `unrecoverableError` set → `phase` stays `"off"`.
2. Warning showing → set `connectionError` → `phase === "off"`, no `AutoplayWarning`.
3. Same for `unrecoverableError`.
4. Optional: summary loop does not call `startAutoplayMeeting` while blocked.

### Implementation order

1. `systemBlocked` + suspend effect.
2. Idle watch, summary loop, render guard.
3. Tests (2) and (3) are the critical ones.

---

## 2. Simplify health probing

### What we are trying to do

Before `window.location.href = rootPath`, ask: **is the origin serving the app again?**

- `GET /health` same-origin, `cache: "no-store"`.
- `200` → safe to reload.
- Anything else → stay on the overlay and try again later.

That is it. We are not building a general HTTP client.

### Why PR 1 added `AbortController`s

Three separate concerns got wired together:

| Layer | Abort usage today | Real concern |
|-------|-------------------|--------------|
| `probeOriginHealth` | Internal controller + 5s timeout; optional `outerSignal` | Fetch can hang with **no browser default timeout** |
| `Reconnecting` | Effect `AbortController` + `sleep(ms, signal)` + pass signal into probe | Stop the probe loop when overlay **unmounts** (socket came back) |
| `AutoButton` | `guardAbortRef` + `guardAction(signal)` | Cancel in-flight guard when button **unmounts** or a new guard cycle starts |

So the aborters are not really about “health check complexity”. They solve:

1. **Unmount / stale async** — don’t call `location.href` after `Reconnecting` disappeared.
2. **Hung fetch** — `fetch()` can wait forever; we need *some* cap.

For a museum kiosk, `/health` is same-origin and should answer in milliseconds. The
5s timeout and signal forwarding are heavier than we need.

### What we can drop

**`probeOriginHealth(outerSignal?)` → `probeOriginHealth()`**

- One short internal timeout (e.g. **1–2s**, not 5s).
- `Promise<boolean>`, never throws.
- No `AbortSignal` parameter.

**Callers use a cancelled flag instead of passing signals**

```ts
useEffect(() => {
  let alive = true;
  // … probe loop …
  if (alive && ok) window.location.href = rootPath;
  return () => { alive = false; clearTimeout(…); clearInterval(…); };
}, […]);
```

That covers unmount for `Reconnecting` and `AutoplayCoordinator.exitAutoplay` without
`AbortController` in the overlay.

**`AutoButton.guardAction` → no signal**

```ts
guardAction?: () => boolean | Promise<boolean>;
```

Use a `cancelled` ref on unmount / new cycle instead of aborting the probe. The probe
is so short that overlapping calls are harmless if we ignore late results.

**Remove `sleep(ms, signal)` in `Reconnecting`**

Replace the async `for` loop with:

- `setTimeout` for the initial museum delay, then
- `setInterval` (or chained `setTimeout`) every `MUSEUM_HEALTH_RETRY_MS`,

all cleared in the effect cleanup. No custom abortable sleep helper.

### What we keep

- **A timeout on the fetch** — still required; browsers do not time out `fetch` for you.
  Implementation can be `AbortController` *inside* `probeOriginHealth` only (private, ~5
  lines), or `Promise.race` with a timeout promise. Callers do not see signals.
- **Probe-before-reload semantics** — unchanged from PR 1.
- **`MUSEUM_HEALTH_RETRY_MS` / `MUSEUM_HEALTH_RETRY_SECONDS`** — shared 10s retry cadence.

### What we do not need

- `outerSignal` on `probeOriginHealth`.
- Abort tests for “caller cancelled probe” — replace with “effect cleanup prevents
  navigation”.
- `guardAction(AbortSignal)` on `AutoButton` unless other callers need it later (none
  today besides museum restart).

### File touch list

```
client/src/autoplay/
  probeOriginHealth.ts           EDIT — drop outer signal; shorter timeout
  AutoplayCoordinator.tsx        EDIT — exitAutoplay: alive flag (plus §1 autoplay pause)

client/src/main/overlay/
  Reconnecting.tsx               EDIT — interval/timeouts + alive flag; drop sleep+abort loop

client/src/AutoButton.tsx        EDIT — guardAction without signal

client/tests/unit/autoplay/
  probeOriginHealth.test.ts      EDIT — drop abort-via-outer-signal cases; keep timeout/fail paths

client/tests/unit/main/overlay/
  Reconnecting.test.tsx          EDIT — unmount still prevents navigation (alive flag)

client/tests/unit/AutoButton.test.tsx   EDIT — guard signature
client/tests/unit/main/overlay/CouncilError.test.tsx  EDIT — if guard mock uses signal
```

### Rationale summary

| Question | Answer |
|----------|--------|
| Why probe at all? | Avoid reloading into Chrome/Cloudflare error pages while origin is down. |
| Why any timeout? | `fetch` can hang; cap at ~1–2s for same-origin `/health`. |
| Why `AbortController` everywhere? | PR 1 over-factored cancellation; a boolean `alive` + `clearTimeout`/`clearInterval` is enough for our three call sites. |
| Risk of simplification? | Low — shorter probe, same reload guard, easier to read. |

---

## Suggested PR split

Can ship as one PR or two:

| Slice | Scope |
|-------|--------|
| **1.5a** | Autoplay pause during errors (§1 only) |
| **1.5b** | Probe simplification (§2 only) |

§1 is independent of §2. §2 is a small refactor of PR 1 code; safe to do whenever.

---

## Checklist

- [x] `systemBlocked` gate + warning suspend in `AutoplayCoordinator`
- [x] Autoplay coordinator tests for overlap cases
- [x] `probeOriginHealth()` without outer signal; shorter timeout
- [x] `Reconnecting` timer loop without `AbortController` / `sleep`
- [x] `AutoButton` `guardAction` without signal
- [x] Update unit tests; run autoplay + overlay suite

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-07 | Initial PR 1.5 plan (autoplay pause + probe simplification) |
