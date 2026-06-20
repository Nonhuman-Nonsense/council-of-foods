# Council PTT Bridge

Local daemon that owns the museum talk-button USB port and exposes it to the browser over WebSocket.

```
Arduino ──USB──► bridge ──ws://127.0.0.1:8765/v1/ptt──► Council app
```

## Quick start (development)

```bash
cd button/bridge
npm install
npm run dev          # real USB device
npm run dev:mock     # no hardware — simulates PONG etc.
```

In another terminal:

```bash
npm run smoke-test   # checks /health + WebSocket PING/PONG
```

Then start the client (`cd client && npm run dev`), open `/#setup`, enable **Push to Talk**.

## Hardware test checklist (for field tester)

Use this when you have the physical button plugged into a Mac.

### 1. Install bridge

```bash
cd button/bridge
npm install
npm run build
npm run dev
```

Leave that terminal open. You should see:

```
[ptt-bridge] listening on http://127.0.0.1:8765 (ws path /v1/ptt)
[ptt-bridge/serial] connected /dev/cu.usbmodem...
```

If no device is found, check USB cable/port. List ports:

```bash
npx @serialport/list
```

Force a specific port:

```bash
PTT_SERIAL_PATH=/dev/cu.usbmodem14101 npm run dev
```

### 2. Smoke test (no browser)

```bash
npm run smoke-test
```

Expected: `smoke test passed`

### 3. Browser test

1. Open the Council app (local dev or deployed URL)
2. Go to `/#setup`
3. Enable **Push to Talk**
4. Check:
   - **Status:** Connected
   - Button LED should **pulse** (not cycle one-at-a-time)
5. Press and release the button — talk input should work in a meeting
6. Reload the page — should reconnect within a few seconds

### 4. Unplug / replug test

1. With app open and connected, unplug USB
2. Status should go to Disconnected; bridge log shows port closed
3. Replug USB
4. Should recover within ~10s without staff action

### 5. Report issues

Send bridge terminal output and the result of:

```bash
curl http://127.0.0.1:8765/health
```

## Museum Mac install (persistent)

```bash
sudo button/bridge/install/macos/install.sh
```

Uninstall:

```bash
sudo button/bridge/install/macos/uninstall.sh
```

Logs: `/var/log/council-ptt-bridge.log`

Restart:

```bash
sudo launchctl kickstart -k system/com.council.ptt-bridge
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PTT_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `PTT_BRIDGE_PORT` | `8765` | HTTP + WebSocket port |
| `PTT_SERIAL_PATH` | auto | Force serial device path |
| `PTT_SERIAL_VENDOR_ID` | `239a` | Adafruit USB vendor |
| `PTT_MOCK_SERIAL` | `0` | `1` = mock device (no USB) |
| `PTT_BAUD_RATE` | `115200` | Match Arduino firmware |

## Wire protocol

**Bridge → browser**

```json
{ "type": "status", "state": "connected", "path": "/dev/cu.usbmodem1" }
{ "type": "line", "text": "PTT_DOWN" }
```

**Browser → bridge**

```json
{ "type": "write", "line": "LED_PULSE" }
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Bridge: Not running | Daemon not started | `npm run dev` or `install.sh` |
| Bridge running, Serial disconnected | USB unplugged or wrong port | Replug; set `PTT_SERIAL_PATH` |
| LED cycles one-at-a-time | No serial host | Bridge not connected to device |
| `smoke test failed` | Bridge down or serial not open | Check bridge logs |
| Port busy | Arduino IDE Serial Monitor open | Close Serial Monitor |
