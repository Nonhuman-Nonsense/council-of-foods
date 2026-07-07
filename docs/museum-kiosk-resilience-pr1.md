# Museum kiosk resilience — PR 1 plan

**Parent:** [museum-kiosk-resilience-plan.md](./museum-kiosk-resilience-plan.md)

**Goal:** Museum hard-reloads only when `GET /health` succeeds.

**Status:** Implemented.

**Related:** [agent-error-handling-plan.md](./agent-error-handling-plan.md) —
`errorStore` + agent retry already shipped; PR 1 only changes museum reload behavior.

---

## Design principle

Museum unattended reload = **kiosk / autoplay ops**.

- **`probeOriginHealth`** — one small file in `autoplay/` (static import everywhere).
- **`AutoplayCoordinator`** stays **lazy-loaded** in `Main.tsx` — overlays never
  import the coordinator component module.
- **UI state** stays in existing overlay components (`CouncilError`, `Reconnecting`).

**1 new file + 3 edited components + locales + tests.**

---

## File tree

```
client/src/autoplay/
  probeOriginHealth.ts      NEW — probeOriginHealth + HEALTH_PROBE_TIMEOUT_MS
  AutoplayCoordinator.tsx   EDIT — import probe; exitAutoplay uses it

client/src/main/overlay/
  CouncilError.tsx          EDIT — MuseumRestartButton (imports probe)
  Reconnecting.tsx          EDIT — inline probe loop (imports probe)

client/src/locales/
  translation_en.json       EDIT — 2 strings

client/tests/unit/autoplay/
  probeOriginHealth.test.ts NEW
  AutoplayCoordinator.test.tsx   EDIT — exitAutoplay + fetch mock

client/tests/unit/main/overlay/
  CouncilError.test.tsx     NEW
  Reconnecting.test.tsx     EDIT
```

All probe consumers import:

```ts
import { probeOriginHealth } from "@/autoplay/probeOriginHealth";
```

---

## `probeOriginHealth.ts` (new)

~20 lines. No React. Lives next to `autoplayStore.ts` / `AutoplayCoordinator.tsx`.

```ts
export const HEALTH_PROBE_TIMEOUT_MS = 5_000;
export const MUSEUM_HEALTH_RETRY_MS = 10_000;
export const MUSEUM_HEALTH_RETRY_SECONDS = 10;

/** Museum kiosk: true when same-origin GET /health returns 200. */
export async function probeOriginHealth(signal?: AbortSignal): Promise<boolean>
```

- `fetch("/health", { cache: "no-store", signal })` with combined timeout + caller abort.
- Return `false` on network error, non-200, or abort — never throw.
- **`MUSEUM_HEALTH_RETRY_*`** — shared 10s interval for Reconnecting probe loop and CouncilError countdown.

---

## `AutoplayCoordinator.tsx`

```ts
import { probeOriginHealth } from "./probeOriginHealth";
```

**`exitAutoplay`:**

```ts
setPhase("off");
if (isMuseumMode) {
  void probeOriginHealth().then((ok) => {
    if (ok) window.location.href = "/";
  });
} else {
  window.location.href = "/";
}
```

Add `isMuseumMode` to `useCallback` deps. No other coordinator changes.

---

## `CouncilError.tsx` — museum restart UI

```ts
import { probeOriginHealth, MUSEUM_HEALTH_RETRY_SECONDS } from "@/autoplay/probeOriginHealth";
```

### Private `MuseumRestartButton` (same file, not exported)

| Phase | Render |
|-------|--------|
| `countdown` | `<AutoButton key={cycle} timeout={MUSEUM_HEALTH_RETRY_SECONDS} action={startCheck}>` |
| `checking` | Disabled button + inline CSS spinner + `t("error.checkingConnection")` |

Flow: countdown → checking → `probeOriginHealth` → navigate or retry countdown.
Abort on unmount; navigate at most once.

```tsx
{isMuseumMode ? (
  <MuseumRestartButton targetPath={rootPath} />
) : (
  <a href={rootPath}>…</a>
)}
```

---

## `Reconnecting.tsx` — inline effect

```ts
import { probeOriginHealth, MUSEUM_HEALTH_RETRY_MS } from "@/autoplay/probeOriginHealth";
```

`MUSEUM_RECONNECTING_RESTART_MS = 2 * 60 * 1000` stays local.

- `waitingForServer` state → subtitle `error.waitingForServer` vs `error.reconnecting`
- Museum `useEffect`: 2 min timer → probe loop, **10s** between failures (`MUSEUM_HEALTH_RETRY_MS`)
- Cleanup: `clearTimeout` + `AbortController.abort()` on unmount (reconnect recovery)

---

## i18n

`translation_en.json` → `"error"`:

- `checkingConnection`: `"Checking connection…"`
- `waitingForServer`: `"Waiting for server…"`

---

## UX

| Surface | Museum |
|---------|--------|
| **CouncilError** | 10s countdown → checking → reload or **10s** loop |
| **Reconnecting** | 2 min → waiting copy + probe every **10s** |
| **Web** | Unchanged |

---

## Implementation order

1. **`probeOriginHealth.ts`** + **`probeOriginHealth.test.ts`**
2. **`CouncilError.tsx`** + **`CouncilError.test.tsx`**
3. **`Reconnecting.tsx`** + extend **`Reconnecting.test.tsx`**
4. **`AutoplayCoordinator.tsx`** + extend **`AutoplayCoordinator.test.tsx`**
5. **`translation_en.json`**

Probe file first — everything else depends on it.

---

## Tests

**`probeOriginHealth.test.ts`** — fetch mock: 200, 503, network error, abort, timeout.

**`CouncilError.test.tsx`** — museum countdown/check/navigate/retry; web link.

**`Reconnecting.test.tsx`** — museum 2 min gate, waiting copy, no blind href, unmount abort.

**`AutoplayCoordinator.test.tsx`** — museum exit: unhealthy → no href.

---

## PR checklist

- [x] `autoplay/probeOriginHealth.ts` + unit test
- [x] `MuseumRestartButton` in `CouncilError.tsx`
- [x] `Reconnecting.tsx` probe loop
- [x] `AutoplayCoordinator.tsx` exit uses probe
- [x] `translation_en.json`
- [x] `AutoplayCoordinator` remains lazy-only in `Main.tsx` (no overlay imports from it)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-05 | Initial PR 1 plan |
| 2026-07-07 | Simplified to existing overlay components |
| 2026-07-07 | Probe in `AutoplayCoordinator.tsx` (autoplay domain) |
| 2026-07-07 | **`probeOriginHealth.ts`** — separate file so coordinator stays lazy-loaded |
| 2026-07-07 | Unified **10s** retry (`MUSEUM_HEALTH_RETRY_MS`) — removed backoff / 15s second pass |

---

## Follow-up: merge `MuseumRestartButton` into `AutoButton` (done)

`MuseumRestartButton` duplicates countdown/checking/retry logic that fits naturally
on `AutoButton` behind an optional prop. **AutoplayWarning** stays unchanged.

### Goal

One component owns: drain countdown → optional async guard → action, with retry
loop when guard returns `false`.

### API (proposed)

```tsx
export interface AutoButtonProps {
  timeout: number;
  action: () => void;
  children: ReactNode;
  /** When set, runs before `action` on click or timeout. `true` → run `action`; `false` → restart countdown. */
  guardAction?: (signal: AbortSignal) => boolean | Promise<boolean>;
  /** Shown on the disabled button while `guardAction` is in flight. */
  checkingLabel?: ReactNode;
  // …existing style/className/type
}
```

- **No `guardAction`** → today’s behavior exactly (fire `action` once).
- **With `guardAction`** → countdown → checking UI → guard → `action` or retry.

`AutoButton` does **not** import `probeOriginHealth` — stays generic. CouncilError
wires the museum guard at the call site.

### `CouncilError.tsx` after refactor

```tsx
<AutoButton
  timeout={MUSEUM_HEALTH_RETRY_SECONDS}
  guardAction={probeOriginHealth}
  checkingLabel={t("error.checkingConnection")}
  action={() => {
    window.location.href = rootPath;
  }}
  style={{ marginTop: "10px" }}
>
  {t("app.restart")}
</AutoButton>
```

Delete `MuseumRestartButton`, checking styles, and inline `@keyframes` (move spinner
into `AutoButton`).

### `AutoButton.tsx` behavior

| Phase | UI |
|-------|-----|
| `countdown` | Current drain button; click or timer triggers guard path |
| `checking` | Disabled button, inline spinner, `checkingLabel` ?? `children` |

Internal state: `phase`, `cycle` (bumps to restart timer + CSS animation via `key={cycle}` on drain layer or remount timer effect).

On fire (click or timeout):

1. Clear countdown timer.
2. If no `guardAction` → `actedRef = true`, `action()` (unchanged).
3. If `guardAction` → `phase = checking`, `await guardAction(ac.signal)`.
   - `true` → `actedRef = true`, `action()`.
   - `false` → `cycle++`, `phase = countdown` (restart 10s drain; **do not** set `actedRef`).
4. Unmount → `AbortController.abort()`.

`actedRef` only set when `action` actually runs — same “once” guarantee for success path.

### Files

| File | Change |
|------|--------|
| `client/src/AutoButton.tsx` | Add `guardAction`, `checkingLabel`, phase machine |
| `client/src/main/overlay/CouncilError.tsx` | Remove `MuseumRestartButton`; use guarded `AutoButton` |
| `client/tests/unit/AutoButton.test.tsx` | **NEW** — guard pass/fail/retry, unmount abort |
| `client/tests/unit/main/overlay/CouncilError.test.tsx` | Simplify (less to mock if guard tested on AutoButton) |
| `docs/museum-kiosk-resilience-pr1.md` | This section |

**Unchanged:** `AutoplayWarning.tsx`, `Reconnecting.tsx`, `probeOriginHealth.ts`.

### Pros

- Retry UX lives in one reusable place (future museum overlays with auto-retry buttons).
- `CouncilError` goes back to ~15 lines for the museum branch.
- `AutoButton` stays domain-agnostic (`guardAction` is any async predicate).

### Cons / risks

- `AutoButton` grows (~40 lines) — still one file, one responsibility.
- Need careful timer reset when `cycle` bumps (test with fake timers).
- `checkingLabel` styling must work on dark overlays (reuse same spinner CSS as today).

### Tests (`AutoButton.test.tsx`)

1. No guard — action once on timeout (existing behavior).
2. Guard returns `true` — action runs once.
3. Guard returns `false` — no action; after another timeout, guard runs again.
4. Click during countdown — guard runs immediately.
5. Unmount during guard — action never runs.
6. `matchMedia` mock (already needed for drain).

### Implementation order

1. Extend `AutoButton` + unit tests.
2. Simplify `CouncilError.tsx`.
3. Run full overlay + autoplay test suite.

---

## Follow-up: guard retry status below button (done)

### Problem (current UX)

When `guardAction` runs, `AutoButton` swaps the whole button to a disabled
**checking** state (`checkingLabel` on the button). That feels wrong on
`CouncilError`:

- Label flickers between “Restart” and “Checking connection…”
- If the probe is fast, visitors barely see checking; they mostly notice the
  countdown restarting with no explanation.
- When the server is down, **“Restart”** draining again with no context looks
  like nothing happened.

### Goal

| Element | Behavior |
|---------|----------|
| **Button label** | Always `children` (“Restart”) — never replaced |
| **Button during guard** | Disabled; optional: pause drain or keep drain (see below) |
| **Below button** | Small status line when guard failed and we are retrying |

Copy (museum / `CouncilError`):  
**“Server unavailable for restart, retrying…”**

Consumers pass copy once; `AutoButton` decides when to show it.

### `AutoButton` API change

**Remove:** `checkingLabel`

**Add:**

```tsx
/** Shown below the button while guard has failed and countdown is retrying. */
guardRetryMessage?: ReactNode;
```

Only relevant when `guardAction` is set. `AutoplayWarning` unchanged (no guard).

### Internal state (simplified)

Drop separate `checking` **button** UI. Keep `phase` internally or replace with:

- `awaitingGuard: boolean` — probe in flight
- `guardFailed: boolean` — last guard returned `false` (set on fail, clear on success/unmount)

**Show `guardRetryMessage` when:** `guardFailed && !actedRef` (after first failed probe until success).

**Button render:** always one `<button>` with `{children}`.

| State | Button | Line below |
|-------|--------|------------|
| Initial countdown | Enabled, drain | hidden |
| Probe in flight | Disabled, label “Restart” | hidden (probe is brief) |
| Probe failed → retry countdown | Enabled, drain restarts | **guardRetryMessage** |
| Probe OK | `action()` runs | (unmount) |

Optional polish: during probe, disable click but **keep drain animation** so the
button still looks like “Restart” in progress. Simpler alternative: freeze drain
while disabled — either is fine; prefer **disabled + frozen label**, drain
continues from `cycle` reset on fail.

### Layout

Wrap in a column container inside `AutoButton`:

```tsx
<div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
  <button>…</button>
  {showRetryMessage && (
    <p role="status" style={guardRetryMessageStyle}>{guardRetryMessage}</p>
  )}
</div>
```

`guardRetryMessageStyle`: small, muted (`fontSize: 0.85rem`, `opacity: 0.75`,
`maxWidth: 280px`, centered). No spinner in the status line — calm kiosk copy.

Remove checking spinner styles / `@keyframes auto-button-check-spin` from
`AutoButton` if unused.

### `CouncilError.tsx`

```tsx
<AutoButton
  timeout={MUSEUM_HEALTH_RETRY_SECONDS}
  guardAction={probeOriginHealth}
  guardRetryMessage={t("error.restartUnavailableRetrying")}
  action={() => { window.location.href = rootPath }}
  style={{ marginTop: "10px" }}
>
  {t("app.restart")}
</AutoButton>
```

Remove `checkingLabel`.

### i18n

`translation_en.json` → `"error"`:

- Add: `restartUnavailableRetrying`: `"Server unavailable for restart, retrying…"`
- **Remove or keep unused:** `checkingConnection` (remove if nothing else uses it)

### Tests

**`AutoButton.test.tsx`**

- Update/remove “shows checking label” test.
- Add: guard fails → button text stays “Go”, `guardRetryMessage` visible.
- Add: guard fails then countdown restarts → message still visible.
- Add: guard succeeds → message never shown (or not visible after action).
- Initial mount → no message.

**`CouncilError.test.tsx`**

- Museum fail path: expect `error.restartUnavailableRetrying`, not
  `error.checkingConnection`.
- Museum OK path: still navigates; no retry message required before navigate.

### Files

| File | Change |
|------|--------|
| `AutoButton.tsx` | Single button UI + optional status `<p>` below |
| `CouncilError.tsx` | `guardRetryMessage` prop only |
| `translation_en.json` | New key |
| `AutoButton.test.tsx` | Update |
| `CouncilError.test.tsx` | Update |

**Unchanged:** `Reconnecting.tsx`, `AutoplayWarning.tsx`, `probeOriginHealth.ts`.

### Implementation order

1. `AutoButton.tsx` + tests
2. `CouncilError.tsx` + i18n + overlay test tweak

