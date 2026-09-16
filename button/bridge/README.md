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

The installer also sets up printing:

- It creates the spool at `/usr/local/lib/council-button-bridge/print`, next to the bridge
  code, writable by staff, and passes it to the daemon as `BRIDGE_PRINT_SPOOL_DIR`.
  Reinstalling or updating replaces the code but keeps `print/`.
- It puts a **Council Print** shortcut to the spool on the logged-in user's Desktop. The
  folder isn't on the Desktop itself, because macOS privacy protection can block the root
  daemon from writing there.
- It sets `printer-error-policy=retry-job` on the default printer, so CUPS doesn't leave
  the queue stopped after paper out or a jam. With no default printer it warns, and jobs
  wait in `pending/` until one is set and the installer is re-run.
- The first time, it asks for the council server (default `https://council-of-foods.com`)
  and the bridge key, and writes them to `/usr/local/lib/council-button-bridge/alerts.env`
  (root-only, mode 600). Later installs keep the file. With no key, or no terminal, alerts
  stay off; set `BRIDGE_SERVER_KEY` in the file and restart the bridge to turn them on.

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

Uninstalling removes everything, including the Desktop shortcut and the printed protocols in
`/usr/local/lib/council-button-bridge/print`.

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
| `BRIDGE_ALERTS_FILE` | `./alerts.env` | Env file read at startup for the settings below; real env vars win |
| `BRIDGE_SERVER_URL` | _(none)_ | Council server that emails printer alerts |
| `BRIDGE_SERVER_KEY` | _(none)_ | That server's `COUNCIL_BRIDGE_KEY`; alerts are off without it |
| `BRIDGE_MOCK_PRINTER` | _(off)_ | `1` = mock printer; or start it in a mode: `fail`, `paper-out`, `stuck` |

## Printing

The museum app prints each live meeting's protocol by posting the PDF to the bridge:

```
POST /v1/print?meetingId=42      Content-Type: application/pdf, body = PDF bytes
POST /v1/print?test=1            staff test page: never a duplicate
→ 202 {"status":"queued"} · 200 {"status":"duplicate"} · 400 · 403 · 413 · 503 (printing off)
```

Jobs go through a folder spool, so printing survives crashes, reboots and a printer that is off:

- The PDF is written to `pending/<host>_<meetingId>.pdf`, where `<host>` is the page's host.
- A worker prints one job at a time with `lp -o media=A4` and moves it to `done/` (kept forever).
- A job `lp` refuses stays in `pending/` and is retried with backoff (5 s up to 5 min) until it prints.
- Anything in `pending/` is printed when the bridge starts, or within 30 s of being copied
  there. To reprint a protocol, copy it from `done/` back into `pending/`.
- A key already in `pending/` or `done/` is never printed again, so client retries are safe.

`/health` includes a `print` block: the printer (`name`, `state`, CUPS `alerts`, and the jobs
still in its queue, `queuedJobs`/`oldestJobAt`), the `pending` count, `lastError`,
`lastPrintedAt`, and `attention`.

`attention` (`{ reason, since }` or `null`) says the printer needs someone to look at it. It
comes from `src/printAttention.ts` and is re-checked every 30 s:

- A CUPS error the printer reports (`media-empty`, `media-jam`, `door-open`…), with the
  `-error`/`-report` suffix removed. Warnings such as low toner don't count. `offline`
  only counts while something is waiting to print, so a printer switched off overnight
  is fine.
- `stopped`: the print queue is paused.
- `not-printing`: a protocol has waited 10 minutes, in `pending/` or in the printer's
  queue, whatever the printer says. Many USB printers never report being out of paper.
- `no-printer`: there's no default printer.

The wording for each reason is in `shared/printerReasons.ts`.

`lp` succeeding means CUPS accepted the job, not that paper came out. After that CUPS holds
the job, and by default it stops the whole queue on a printer error.

### Alert emails

The bridge decides **when** museum staff should hear about `attention`; the council server
decides **who** and sends the email (see `server/README.md`). Nothing here holds an address.

- `src/printAlerts.ts` holds the rules: 2 min grace, a new email when the reason changes,
  reminders every 4 h (only while the venue is open, plus one at opening), and "resolved"
  after 2 min fixed. A problem that clears before staff were told sends nothing.
- `src/alertMonitor.ts` runs them every 30 s and posts to `/api/bridge/printer-alerts`,
  retrying with backoff (30 s up to 10 min) if the server is unreachable. Only the newest
  undelivered alert is kept. The venue and state are saved in `print/alerts-state.json`,
  so restarts don't resend.
- Staff page endpoints (same origin rules as `/v1/print`):
  - `GET /v1/alerts/venues`: `{ venues, current }` from the server, addresses masked
  - `PUT /v1/alerts/venue {"venueId": "…" | null}`: only listed venues
  - `POST /v1/alerts/test`: test alert to the chosen venue, once a minute
- `/health` has an `alerts` block: `configured`, `venue`, `open`, `phase`, `lastSentAt`,
  `lastError`, `undelivered`. It never includes the key.

In development, put the settings in `button/bridge/alerts.env` (gitignored) and point them
at your local server:

```
BRIDGE_SERVER_URL=http://localhost:3001
BRIDGE_SERVER_KEY=<COUNCIL_BRIDGE_KEY from server/.env>
```

### Developing without a printer

`npm run dev:mock` also runs the mock printer: "printed" PDFs are copied to
`.print-spool/mock-printed/` so you can open them. To exercise the endpoint and a printer
outage by hand. The modes are `fail` (lp refuses jobs), `paper-out` (jobs wait and the
printer reports `media-empty-error`), `stuck` (jobs wait and the printer reports nothing) and
`ok` (waiting jobs print):

```bash
curl -X POST -H 'Content-Type: application/pdf' --data-binary @protocol.pdf \
  'http://127.0.0.1:8765/v1/print?meetingId=42'
curl -X POST http://127.0.0.1:8765/v1/test/printer -d '{"mode":"fail"}'   # jobs pile up in pending/
curl -X POST http://127.0.0.1:8765/v1/test/printer -d '{"mode":"paper-out"}'  # jobs wait in the printer
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
