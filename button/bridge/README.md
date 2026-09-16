# Council Button Bridge

Local daemon that owns the museum button USB port and exposes it to the browser over WebSocket.

```
Arduino ──USB──► bridge ──ws://127.0.0.1:8765/v1/button──► Council app
```

## Quick start (development)

```bash
cd button/bridge
npm install
npm run dev          # real USB device
npm run dev:mock     # no hardware — simulates mock USB device
```

Dev mode is **foreground only** — `Ctrl+C` stops it and frees the port. If you get `EADDRINUSE`, a previous instance is still running:

```bash
npm run stop         # kill whatever is on port 8765
npm run restart:mock # stop + start mock bridge
```

In another terminal:

```bash
npm test
```

`npm test` covers unit tests, bridge integration (health, CORS, WebSocket), and end-to-end mock-button → bridge → client tests. No separate smoke script needed.

Then start the client (`cd client && npm run dev`), open `/#staff`, enable **Push to Talk**.

The setup page polls `http://127.0.0.1:8765/health` from the browser. The bridge allows CORS from local dev servers and HTTPS museum app origins (`*.council-of-forest.com`, `*.council-of-foods.com` by default).

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
[button-bridge] listening on http://127.0.0.1:8765 (ws path /v1/button)
[button-bridge/serial] connected /dev/cu.usbmodem...
```

If no device is found, check USB cable/port. List ports:

```bash
npx @serialport/list
```

Force a specific port:

```bash
BUTTON_SERIAL_PATH=/dev/cu.usbmodem14101 npm run dev
```

### 2. Automated test (no browser)

```bash
npm test
```

Expected: all tests pass (includes health + WebSocket + client e2e).

### 3. Browser test

1. Open the Council app (local dev or deployed URL)
2. Go to `/#staff`
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

Apple Silicon (arm64) only. Node 24+ must be installed once on the Mac.

### From GitHub Release (recommended — no git clone)

Install or update to the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/Nonhuman-Nonsense/council-of-foods/main/button/bridge/install/macos/install-release.sh | sudo bash
```

Pin a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/Nonhuman-Nonsense/council-of-foods/main/button/bridge/install/macos/install-release.sh | sudo bash -s -- 1.0.0
```

### From this repo (developers)

Build on the machine and install:

```bash
sudo button/bridge/install/macos/install.sh --rebuild
```

If install fails with `Bootstrap failed: 5`, run uninstall first, then install again:

```bash
sudo button/bridge/install/macos/uninstall.sh
sudo button/bridge/install/macos/install.sh --rebuild
```

If `dist/` is already built, `install.sh` skips the build step.

### Uninstall

From a git checkout:

```bash
sudo button/bridge/install/macos/uninstall.sh
```

After installing from a GitHub release (no git checkout):

```bash
curl -fsSL https://raw.githubusercontent.com/Nonhuman-Nonsense/council-of-foods/main/button/bridge/install/macos/uninstall-release.sh | sudo bash
```

Add `--purge-logs` to remove log files too:

```bash
curl -fsSL .../uninstall-release.sh | sudo bash -s -- --purge-logs
```

Logs: `/var/log/council-button-bridge.log`

Restart:

```bash
sudo launchctl kickstart -k system/com.council.button-bridge
```

## Publishing a release

Releases live in this monorepo — no separate bridge repository.

1. Tag and push (triggers GitHub Actions on `macos-14`):

```bash
git tag button-bridge-v1.0.0
git push origin button-bridge-v1.0.0
```

2. Or use **Actions → Button Bridge Release → Run workflow** and enter a version (e.g. `1.0.1`).

The workflow uploads `council-button-bridge-macos-arm64-<version>.tar.gz` to GitHub Releases.

Local dry-run before tagging:

```bash
button/bridge/scripts/stage-release-bundle.sh 1.0.0
button/bridge/install/macos/smoke-bundle.sh
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BUTTON_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `BUTTON_BRIDGE_PORT` | `8765` | HTTP + WebSocket port |
| `BUTTON_BRIDGE_CORS_SUFFIXES` | `council-of-forest.com,council-of-foods.com` | HTTPS origins allowed to call `/health` and open `/v1/button` |
| `BUTTON_BRIDGE_CORS_ORIGINS` | _(none)_ | Optional comma-separated exact origins (in addition to suffixes) |
| `BUTTON_SERIAL_PATH` | auto | Force serial device path |
| `BUTTON_SERIAL_VENDOR_ID` | `2341` | Arduino USB vendor (Council button board) |
| `BUTTON_MOCK_SERIAL` | `0` | `1` = mock device (no USB) |
| `BUTTON_BAUD_RATE` | `115200` | Match Arduino firmware |
| `BRIDGE_PRINT_ENABLED` | `1` | `0` = refuse print jobs |
| `BRIDGE_PRINT_SPOOL_DIR` | `./.print-spool` | Folder holding `pending/` and `done/` |
| `BRIDGE_PRINTER` | system default | CUPS queue name to print to |
| `BRIDGE_MOCK_PRINTER` | _(off)_ | `1` = mock printer, `fail` = mock printer that refuses jobs |

## Printing

The museum app prints each live meeting's protocol by posting the PDF to the bridge:

```
POST /v1/print?meetingId=42      Content-Type: application/pdf, body = PDF bytes
→ 202 {"status":"queued"} · 200 {"status":"duplicate"} · 400 · 403 · 413 · 503 (printing off)
```

Jobs go through a folder spool, so printing survives crashes, reboots and a printer that is off:

- The PDF is written to `pending/<host>_<meetingId>.pdf`, where `<host>` is the page's host.
- A worker prints one job at a time with `lp -o media=A4` and moves it to `done/` (kept forever).
- A job `lp` refuses stays in `pending/` and is retried with backoff (5 s up to 5 min) until it prints.
- Anything in `pending/` is printed when the bridge starts, or within 30 s of being copied
  there. To reprint a protocol, copy it from `done/` back into `pending/`.
- A key already in `pending/` or `done/` is never printed again, so client retries are safe.

`/health` includes a `print` block: the printer (`name`, `state`, CUPS `alerts`), the `pending`
count, `lastError` and `lastPrintedAt`.

`lp` succeeding means CUPS accepted the job, not that paper came out. After that CUPS holds
the job, and by default it stops the whole queue on a printer error.

### Developing without a printer

`npm run dev:mock` also runs the mock printer: "printed" PDFs are copied to
`.print-spool/mock-printed/` so you can open them. To exercise the endpoint and a printer
outage by hand:

```bash
curl -X POST -H 'Content-Type: application/pdf' --data-binary @protocol.pdf \
  'http://127.0.0.1:8765/v1/print?meetingId=42'
curl -X POST http://127.0.0.1:8765/v1/test/printer -d '{"mode":"fail"}'   # jobs pile up in pending/
curl -X POST http://127.0.0.1:8765/v1/test/printer -d '{"mode":"ok"}'     # they print
```

To test real `lp`/`lpstat` without paper, add a fake network printer that `nc` listens for.
Don't test against a real printer queue that happens to be disconnected: its jobs wait in CUPS
and come out the next time it's plugged in.

```bash
sudo lpadmin -p CouncilFake -E -v socket://127.0.0.1:9100 -o printer-error-policy=retry-job \
  -P /System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/PrintCore.framework/Versions/A/Resources/Generic.ppd
nc -l 9100 > /tmp/printed.ps          # the "printer"; stop nc to switch it off
BRIDGE_PRINTER=CouncilFake BUTTON_MOCK_SERIAL=1 npm run dev
sudo lpadmin -x CouncilFake           # clean up
```

## Wire protocol

**Bridge → browser**

```json
{ "type": "status", "state": "connected", "path": "/dev/cu.usbmodem1" }
{ "type": "line", "text": "BUTTON_DOWN" }
```

**Browser → bridge**

```json
{ "type": "write", "line": "LED_PULSE" }
```

**Bridge → Arduino (self-initiated, no browser involved)**

Whenever the serial device is open but zero browsers are connected over `/v1/button`
(e.g. blocked by a browser's local-network permission), the bridge writes `LED_ERROR`
directly to the Arduino. It's cleared automatically the moment a browser client
connects and resyncs its LED mode — no bridge-side "revert" logic needed.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Bridge: Not running | Daemon not started | `npm run dev` or `install.sh` |
| Bridge running, Serial disconnected | USB unplugged or wrong port | Replug; set `BUTTON_SERIAL_PATH` |
| LED cycles one-at-a-time (fast, ~1s/light) | No serial host | Bridge not connected to device |
| LED cycles one-at-a-time (slow, ~3s/light) | Serial connected, no browser client | Browser can't reach bridge (e.g. blocked local-network permission); check bridge WS URL/CORS |
| Tests fail | Bridge code regressed or port conflict | Run `npm run stop`, then `npm test` |
| Port busy | Arduino IDE Serial Monitor open | Close Serial Monitor |
