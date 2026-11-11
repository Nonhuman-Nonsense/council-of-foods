# Museum button

Hardware and host software for the Council installation button.

| Folder | What it is |
|---|---|
| [`arduino/`](arduino/) | Firmware for the Adafruit button board |
| [`bridge/`](bridge/) | Mac daemon — owns USB serial, exposes WebSocket to the browser |

## Testing

| Command | What runs | What it proves |
|---|---|---|
| `cd bridge && npm test` | Vitest in Node | Mock button → real bridge → client **library code** (`ButtonTransport`, `useButtonStore`) |

Bridge unit/integration tests import client modules directly — no browser or `npm run dev` needed. That is intentional: fast, deterministic protocol tests.

## Quick start

1. Upload firmware from `arduino/council_button/`
2. Run the bridge: `cd bridge && npm install && npm run dev`
3. In the app: enable **Push to Talk** at `/#staff`

See each folder's README for firmware and bridge setup. For museum **app mode**, staff page, and install presets, see [MUSEUM.md](../MUSEUM.md) at the repo root.
