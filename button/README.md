# Museum talk button

Hardware and host software for the Council push-to-talk buttons.

| Folder | What it is |
|---|---|
| [`arduino/`](arduino/) | Firmware for the Adafruit button board |
| [`bridge/`](bridge/) | Mac daemon — owns USB serial, exposes WebSocket to the browser |

## Quick start

1. Upload firmware from `arduino/council_ptt/`
2. Run the bridge: `cd bridge && npm install && npm run dev`
3. In the app: enable **Push to Talk** at `/#setup`

See each folder's README for full setup and museum install instructions.
