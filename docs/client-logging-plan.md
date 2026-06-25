# Client dev logging plan

Structured console logging for the council client in development — similar in spirit
to `server/src/utils/Logger.ts` (context + severity) and
`prototype/public/prototype_client.js` (categories, collapsed groups, payloads).

**Status:** Phases **0–2** complete. Phases **3–6** planned.

---

## Goals

1. **One logger** for main cross-cutting events (API, socket, agent tools, button, meta-agent).
2. **Readable** — collapsed groups, category colors, summarized payloads.
3. **Dev-only implementation** — production bundle uses `logger.noop.ts` via Vite alias.
4. **Runtime control** — master switch + per-category filters on `#setup`, persisted in `localStorage`.
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
  logger.ts              # real impl (dev)
  logger.noop.ts         # no-op (production + vitest)
  api/http.ts            # councilFetch (Phase 3)
  settings/councilSettings.ts
```

**Vite alias** (`vite.config.ts`):

```ts
'@/logger': src/logger.noop.ts   // production + vitest
'@/logger': src/logger.ts         // dev serve
```

Imports: `import { log } from '@/logger'`.

TypeScript resolves types from `logger.ts`; production swaps implementation at build time.

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

Developer panel on `#setup` is rendered only when `import.meta.env.DEV`.

---

## `#setup` control panel layout

**Problem:** stacked sections and long status paragraphs feel crowded as settings grow.

**Target:** prototype right-sidebar **density** (grouped panels, compact labels, checkbox grids)
with council overlay styling (`.selected` toggles, council fonts/colors).

```text
┌──────────────────────────────────────────────────────────┐
│  SETUP                                                   │
├─────────────────────────┬────────────────────────────────┤
│  Installation           │  Voice guide                   │
│  [ Web ] [ Museum ]     │  [ Always on ] [ Push to talk ]│
├─────────────────────────┴────────────────────────────────┤
│  Physical button                    (museum + PTT only)  │
│  Bridge ● …   App ● …   USB ● …                          │
│  ▸ Details & hints (collapsible)                         │
├──────────────────────────────────────────────────────────┤
│  Developer                          (dev build only)     │
│  ☑ Client console logging                                │
│  Categories: [All] [None]                                │
│  ☑ API ☑ Socket ☑ Agent ☑ Realtime ☑ Button ☑ Meta …   │
│  ☑ LED preview overlay                                   │
└──────────────────────────────────────────────────────────┘
```

**Components:** `SetupPanel`, `SetupSegmented`, `SetupStatusChip`, `SetupCollapsible` under
`client/src/main/overlay/setup/`, styles in `setupControlPanel.css`.

---

## Instrumentation map (Phases 3–5)

| Category | Location | Events |
|----------|----------|--------|
| **API** | `api/http.ts` `councilFetch` | method, path, status, label |
| **SOCKET** | `useCouncilSocket.ts` | emit/in, summarized payloads |
| **AGENT** | `realtimeEventLoop.ts` | tool name, args, handler result |
| **REALTIME** | event loop + session hook | connect, response created/done |
| **BUTTON** | `buttonStore.ts` | press edges, owner changes |
| **META** | `metaAgentTools.ts`, `MeetingMetaAgent.tsx` | activate, idle resume, handlers |
| **ERROR** | failures across the above | |

**Not logged initially:** caption deltas, every DC event, full conversation arrays.

---

## Phased rollout

### Phase 0 — Logger core ✅

- `logger.ts`, `logger.noop.ts`
- Vite alias + vitest → noop
- `log.event()` with category styles
- Unit tests

### Phase 1 — Settings + runtime filtering ✅

- `councilSettings.ts` + `useCouncilSettings.ts`
- Logger reads settings on each call

### Phase 2 — `#setup` redesign + dev log UI ✅

- Panel layout, status chips, collapsible button block
- Developer panel with logging toggles
- LED debug moved into Developer panel
- i18n + tests

### Phase 3 — HTTP boundary

- `client/src/api/http.ts` → `councilFetch`
- Migrate `api/*.ts` + `realtimeConnection`

### Phase 4 — Socket + button

- `useCouncilSocket.ts`, `buttonStore.ts`

### Phase 5 — Realtime + meta-agent

- `realtimeEventLoop.ts`, `metaAgentTools.ts`, `MeetingMetaAgent.tsx`

### Phase 6 — Polish (optional)

- `window.__councilLogger` for Playwright
- E2e helpers

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
