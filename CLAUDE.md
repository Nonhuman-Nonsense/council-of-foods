# Council of Foods — agent notes

A political arena where AI-driven foods discuss the broken food system. Three parts:
`client/` (React + Vite + zustand, socket.io client), `server/` (Node + Express + socket.io +
MongoDB, OpenAI/TTS orchestration), and `button/` (talk-button stack for museum installs).
`shared/` holds the socket protocol types and prompts used by both sides.

## Required reading

- **[TESTING.md](TESTING.md)** — the testing philosophy: what deserves a test, at what level,
  and what to delete. Read this **before adding or modifying tests**. Key rules: test
  behaviors at module boundaries, one behavior per test, table-driven matrices, search for
  existing coverage before adding a file, never assert prompt wording.
- **[RESILIENCE.md](RESILIENCE.md)** — how the live client survives socket drops (pending
  intents + reconciler). Read this **before touching any client→server socket action** or
  reconnect/resume logic. New client-driven socket actions must follow this pattern.
- [README.md](README.md) — project overview and build instructions.
- [server/README.md](server/README.md) — backend details and test modes (mock/fast/full).
- [MUSEUM.md](MUSEUM.md) — physical kiosk installs (app mode, button bridge, staff setup).

The `docs/` folder is for work-in-progress design docs only; durable architecture
descriptions live in the root docs above.

## Commands

- Server: `cd server && npm test` (type-check + all tests, mocked APIs);
  `npm run test:unit` / `test:integration` for the split; `npm run dev` to run.
- Client: `cd client && npm test` (type-check + all tests); `npm run e2e` (Playwright — needs
  `npm run e2e-server` running in `server/`); `npm run dev` to run.
- Lint either side with `npm run lint`.
