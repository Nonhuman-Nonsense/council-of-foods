# Client dev logging plan

Structured console logging for the council client in development — similar in spirit
to `server/src/utils/Logger.ts` (context + severity) and
`prototype/public/prototype_client.js` (categories, collapsed groups, payloads).

**Status:** Phases **0–6** complete.

---

## Goals

1. **One logger** for main cross-cutting events (API, socket, agent tools, button, meta-agent).
2. **Readable** — collapsed groups, category colors, summarized payloads.
3. **Single `logger.ts`** — same implementation in dev and production; gated at runtime via `#setup` toggles (`getDevLogEnabled()`). Default on in dev, off in production when unset.
4. **Runtime control** — master switch + per-category filters on lazy-loaded `#setup`, persisted in `localStorage`.
5. **Debug meta-agent tools** — trace `continue_meeting` and related handler paths (Phase 5).

---

## Design decisions

### HTTP: `councilFetch`, not global `fetch` or `devFetch`

Do **not** monkey-patch `window.fetch`. Add a single app HTTP helper:

```text
client/src/api/http.ts  →  councilFetch()
```

Only `client/src/api/*` and `realtimeConnection` use it. Logs `API` category OUT/IN inside
that module. Name reflects purpose (app HTTP), not environment.

### File layout

```text
client/src/
  logger.ts              # categories, summarizeLogPayload, log.event, reportTerminalError
  api/http.ts            # councilFetch (Phase 3)
  settings/councilSettings.ts   # localStorage + useCouncilSettings()
  main/overlay/Setup.tsx        # staff setup UI (lazy-loaded via MainOverlays)
  main/overlay/MainOverlays.tsx # lazy(() => import("./Setup")) for #setup
```

**Vite:** `#setup` UI is code-split via `lazy(() => import("./Setup"))` in `MainOverlays` (automatic chunk naming). `@/logger` is a normal import (small runtime no-op when logging is off).

### Logger API

```ts
type LogCategory =
  | 'API' | 'SOCKET' | 'AGENT' | 'REALTIME'
  | 'BUTTON' | 'META' | 'SYSTEM' | 'ERROR';

log.event(category, message, data?: unknown): void
```

**Gating (dev bundle only):**

1. `getDevLogEnabled()` — master switch (`localStorage`)
2. `isDevLogCategoryEnabled(category)` — per-category checkboxes

Default in dev: master **on**, all categories **on**.

**Additive model:** category toggles control styled council groups only. They do **not**
replace native console output for failures:

- **`ERROR` category off** (or master off): `log.event('ERROR', …)` still writes plain
  `console.error('[Council] …')`.
- **`ERROR` category on**: styled collapsed `console.error` group (no duplicate plain line).
- **HTTP 4xx/5xx** with **API** category off: `console.warn` with summarized response body.
- Unhandled exceptions and existing `console.error` call sites are unchanged.

**Output:** `console.groupCollapsed` with category color (prototype-style). No `console.trace`
on routine events; optional stack detail for `ERROR` only.

---

## Settings (`councilSettings.ts`)

| Key | Purpose |
|-----|---------|
| `councilDevLogEnabled` | Master switch (`"true"` / `"false"`) |
| `councilDevLogDisabledCategories` | JSON array of disabled categories (empty = all on) |
| `council-dev-log-change` | `CustomEvent` for cross-tab sync |

Exposed via `useCouncilSettings()`:

- `devLogEnabled`, `setDevLogEnabled`
- `devLogCategories` (all categories with enabled state)
- `setDevLogCategoryEnabled(category, enabled)`
- `setAllDevLogCategories(enabled)`

Developer panel on `#setup` is lazy-loaded in all builds (staff secret URL).

Default when unset: **on** in dev (`import.meta.env.DEV`), **off** in production.

---

## `#setup` control panel layout

**Problem:** stacked sections and long status paragraphs feel crowded as settings grow.

**Target:** grouped panels with segmented toggles and **category pills** (logging), plus an LED preview pill under Voice guide when museum + PTT.

```text
┌─────────────────────────┬─────────────────────────┐
│  Installation           │  Voice guide            │
│  [ Web ] [ Museum ]     │  [ Always on ][ PTT ]   │
│                         │  (dev) LED preview pill │
├─────────────────────────┴─────────────────────────┤
│  Button (full width, museum + PTT)                │
├─────────────────────────┬─────────────────────────┤
│  Logging (dev, half)    │                         │
│  [ On | Off ]  All None │                         │
│  API Socket Agent …     │  ← toggle pills         │
└─────────────────────────┴─────────────────────────┘
```

**Implementation:** private panel helpers and button-status mappers live in `Setup.tsx`
with inline styles (no separate CSS or `setup/` subfolder).

---

## Instrumentation map (Phases 3–5)

| Category | Location | Events |
|----------|----------|--------|
| **API** | `api/http.ts` `councilFetch` | method, path, status, summarized request/response JSON |
| **SOCKET** | `useCouncilSocket.ts` | emit/in, summarized payloads |
| **AGENT** | `realtimeEventLoop.ts` | tool name, args, handler result |
| **REALTIME** | event loop + session hook | connect, response created/done |
| **BUTTON** | `buttonStore.ts`, `buttonBridge.ts` | press edges, owner changes, transport lifecycle, health **state changes** (not every poll) |
| **META** | `metaAgentTools.ts`, `MeetingMetaAgent.tsx` | activate, idle resume, handlers |
| **ERROR** | failures across the above | Structured groups when enabled; always `console.error` when off |

**Not logged initially:** caption deltas, every DC event, full conversation arrays.

**HTTP non-ok without API category:** native `console.warn` with summarized body.

---

## Phased rollout

### Phase 0 — Logger core ✅

- `logger.ts`, `logger.noop.ts`
- Vite alias + vitest → noop
- `log.event()` with category styles
- Unit tests

### Phase 1 — Settings + runtime filtering ✅

- `councilSettings.ts` (storage getters/setters + `useCouncilSettings` hook)
- Logger reads settings on each call

### Phase 2 — `#setup` redesign + dev log UI ✅

- Panel layout, status chips, collapsible button block
- Logging panel (half width) with On/Off segmented control and category pills
- LED preview pill under Voice guide (dev + museum + PTT)
- i18n + tests

### Phase 3 — HTTP boundary ✅

- `client/src/api/http.ts` → `councilFetch`
- Migrated `api/*.ts` + `realtimeConnection`

### Phase 4 — Socket + button ✅

- `useCouncilSocket.ts`, `buttonStore.ts`

### Phase 5 — Realtime + meta-agent ✅

- `realtimeEventLoop.ts`, `useRealtimeVoiceSession.ts`, `metaAgentTools.ts`, `MeetingMetaAgent.tsx`

### Phase 6 — Polish ✅

- `window.__councilLogger` (dev)
- Playwright helpers: `tests/e2e/src/councilDevHelpers.ts`

**Dev window hooks (dev serve only):**

- `window.__councilLogger` — same API as `log` from `@/logger`
- `window.__councilButtonStore` — Zustand store for button/bridge state

---

## Production bundle

| Piece | Production |
|-------|------------|
| `logger.ts` body | Not bundled (alias → noop) |
| `log.event()` call sites | Remain; noop is zero-cost |
| Developer panel | Hidden (`import.meta.env.DEV`) |
| `localStorage` keys | Harmless if set; no output |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-24 | Initial plan: `councilFetch`, `@/logger` alias, setup control panel, phased rollout |
| 2026-06-24 | Phases 0–2 implemented: logger, settings, `#setup` control panel redesign |
| 2026-06-24 | Consolidated files: logger types in `logger.ts`, settings hook in `councilSettings.ts`, setup UI in one `Setup.tsx` |
| 2026-06-24 | Phases 3–6: `councilFetch`, socket/button/realtime/meta instrumentation, Playwright dev helpers |
| 2026-06-24 | Replay audio via `getReplayAudio`; bridge BUTTON logging (state changes + transport); setup Logging pills + LED preview relocation |
| 2026-06-24 | Richer log payloads via `summarizeLogPayload`; API logs request/response bodies; replay audio inlined in `useCouncilMachine` |
| 2026-06-24 | Additive errors: ERROR always mirrors to `console.error`; HTTP non-ok warns when API logging off |
