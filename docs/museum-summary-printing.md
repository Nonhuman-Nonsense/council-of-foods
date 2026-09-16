# Museum summary printing — plan

Status: plan, not implemented. When this ships, move the durable parts into
[MUSEUM.md](../MUSEUM.md) and [button/bridge/README.md](../button/bridge/README.md) and
delete this file.

## Goal

In museum mode, every **live** meeting that reaches its protocol prints the protocol on
the A4 printer attached to the installation Mac, with no UI on screen and no staff
input. Replays never print.

## Decisions

| Question | Answer |
|---|---|
| Modes | Museum only (not presenter, not web) |
| Which meetings | Live only (`liveKey` set). Includes resumed meetings and meetings the visitor walked away from, as long as a summary arrives. Autoplay/replay never prints. |
| When | As soon as the summary message arrives from the server, not when the reading ends. No on-screen UI. |
| Printer | A4, macOS system default printer, overridable with `BRIDGE_PRINTER` in the plist. No picker on the staff page: the choice would live in the browser while printing lives in the bridge. The staff page *shows* the printer and its state instead. |
| On/off | Staff toggle **Print summaries** on `#staff`, stored like **Hardware button** |
| Transport | Browser `POST`s the PDF bytes to the local bridge. No download folder. |
| Retention | `done/` is kept forever |
| Paper-out email | Next step. This plan leaves hooks for it (printer state in `/health`). |

## PRs

1. **Bridge:** print spool, `/v1/print`, mock printer, printer status in `/health`.
2. **Client refactor:** extract `ProtocolDocument` and `renderProtocolPdf`. No behaviour change.
3. **Client printing:** `printSummary` capability, staff toggle and print status panel,
   `SummaryPrintJob` and `printClient`.
4. **Field setup:** print test page, install script and plist changes, MUSEUM.md.

## Architecture

```
Council (live meeting, museum, toggle on)
  └─ summary message arrives
       └─ render protocol template offscreen → jsPDF → Blob
            └─ POST http://127.0.0.1:8765/v1/print?meetingId=123   (application/pdf)
                 │  retries with backoff if the bridge is unreachable
                 ▼
bridge  /v1/print
  ├─ validate (local, allowed origin, numeric id, %PDF- header, size cap)
  ├─ key = <origin host>_<meetingId>   e.g. council-of-foods.com_123
  ├─ already in pending/ or done/? → 200 {status:"duplicate"}
  └─ write tmp/<key>.pdf → rename to pending/<key>.pdf → 202 {status:"queued"}

bridge print worker (one job at a time)
  ├─ on start: scan pending/ (self-healing after crash or reboot)
  ├─ lp -o media=A4 -t "Council #123" [-d $BRIDGE_PRINTER] pending/<key>.pdf
  ├─ exit 0 → move to done/<key>.pdf
  └─ failure → stays in pending/, retry with backoff (5s → 5min cap, forever)
```

The origin host is part of the key because staging and production can share meeting IDs
on the same machine.

Keep in mind that `lp` exiting 0 only means **CUPS accepted the job**, not that paper came
out. From then on CUPS is the queue. By default CUPS *stops the printer* on an error
(paper out, printer off), and the queue stays stopped even after the problem is fixed.
The install step switches this to `retry-job` (see step 6).

## Implementation steps

### 1. Client: capability and staff toggle

- `client/src/settings/capabilities.ts`: add `printSummary` with a doc comment. `MUSEUM:
  true`. `WEB` and `PRESENTER: false`. This is how "museum only" works without branching
  on the mode anywhere else.
- `client/src/settings/councilSettings.ts`: add `PRINT_SUMMARIES_ENABLED_KEY` and
  `PRINT_SUMMARIES_CHANGE_EVENT`, `getPrintSummariesEnabled` and
  `setPrintSummariesEnabled`, and expose them from `useCouncilSettings`. Copy the
  `PttHardware` pattern exactly.
- `client/src/main/overlay/Staff.tsx`: add a **Print summaries** toggle in the second row
  next to Hardware button (`data-testid="staff-print-summaries-toggle"`), plus a locale key
  in every translation file. When the toggle is on, show a small print panel with the
  bridge's print status from `/health` (printer name, state, pending count) and a
  **Print test page** button (step 5).
- Printing happens only when `capabilities.printSummary && printSummariesEnabled`.

### 2. Client: shared protocol document and PDF generation

- Extract the hidden PDF template in `client/src/council/overlays/Summary.tsx` (the
  `protocolRef` block and `Disclaimer`) into `ProtocolDocument.tsx`.
- Add `client/src/council/protocolPdf.ts` with `renderProtocolPdf(element): Promise<Blob>`.
  It loads Tinos, runs `jsPDF.html(...)` with the current options, and returns
  `pdf.output("blob")`. The web download calls it and saves the result under the same
  filename as today. There is no behaviour change for web.

### 3. Client: print trigger

- New component `council/SummaryPrintJob.tsx`, mounted in `Council.tsx` only when
  `liveKey && capabilities.printSummary && printSummariesEnabled`.
- It watches `state.textMessages` for a `type === "summary"` message. It doesn't wait for
  `state.summary`, which only gets set when playback reaches the summary. When the message
  appears, it renders `ProtocolDocument` offscreen, builds the Blob, and hands it to the
  print client. A ref keyed by meeting ID means one attempt per meeting per page load.
- `client/src/museum/print/printClient.ts` is a module-level queue, not tied to a
  component, so navigating back to the landing page doesn't cancel an in-flight send.
  - `POST ${bridgeHttpBase}/v1/print?meetingId=…` with `Content-Type: application/pdf`.
    Derive the base URL from the existing bridge URL helper in
    `museum/button/buttonBridge.ts` so there is one override.
  - Retry on network error or 5xx with backoff (1s → 30s) for up to about 10 minutes, then
    log and give up. 202 and 200 (duplicate) mean done. 4xx means log once and give up.
  - Log under an existing dev-log category, or add a `print` category.
- If the page reloads before the POST, nothing prints. This is acceptable: the bridge is a
  launchd daemon that is effectively always up, and the POST happens seconds after the
  summary arrives.
- Not a socket action, so the pending-intent pattern in RESILIENCE.md does not apply.
  The bridge's duplicate check keeps retries and resumes safe.

### 4. Bridge: print spool and worker

New files in `button/bridge/src/`:

- `config.ts`: add
  - `printEnabled` (`BRIDGE_PRINT_ENABLED`, default true)
  - `printSpoolDir` (`BRIDGE_PRINT_SPOOL_DIR`, dev default `./.print-spool`, gitignored)
  - `printer` (`BRIDGE_PRINTER`, default null = system default)
  - `mockPrinter` (`BRIDGE_MOCK_PRINTER`: unset, `1`, or `fail`)
  - `printMaxBytes` (default 20 MB)
- `printer.ts`: a `PrinterLike` interface with `print(file, title): Promise<void>` and
  `status(): Promise<PrinterStatus>`.
  - `LpPrinter` runs `lp` with `execFile` and a 60s timeout. `status()` parses `lpstat -d`
    and `lpstat -p <name> -l` for the printer name, idle/printing/stopped, and state
    reasons. The paper-out email will build on these reasons later.
  - `MockPrinter` copies the file to `<spool>/mock-printed/` and logs it. In `fail` mode it
    throws until the mode is switched back through the test endpoint, so you can see a
    failure recover.
- `printSpool.ts`: the `PrintSpool` class.
  - `enqueue(key, bytes)` does the size and `%PDF-` checks, checks for duplicates, writes
    to `tmp/`, renames into `pending/`, and wakes the worker.
  - `start()` creates the folders, clears out `tmp/`, and processes `pending/` oldest
    first.
  - The worker runs one job at a time with a backoff after failures. `stop()` waits for
    the current job to finish.
  - `snapshot()` returns `{ pending, done, lastError, lastPrintedAt }`.
- `wsServer.ts`: routes.
  - `OPTIONS /v1/print`: CORS preflight, since `application/pdf` is not a simple content
    type. Allow `POST` and `Content-Type`.
  - `POST /v1/print`: local address plus allowed origin (same rules as the WebSocket), a
    numeric `meetingId`, and a streaming body read that aborts past the size cap. Build the
    key from the origin host (`local` when there is no Origin header), then enqueue.
    Responses: 202 queued, 200 duplicate, 400 bad input, 403 forbidden, 413 too big, 503
    printing disabled.
  - `/health` gains `print: { enabled, printer, printerState, stateReasons, pending,
    lastError }`. Cache printer status and refresh it every 30s so health checks stay cheap.
  - Mock mode only, like `/v1/test/simulate-button`: `POST /v1/test/printer {mode:"ok"|"fail"}`.
- `index.ts`: build the printer (mock or lp) and the spool, then `start()` and `stop()` it
  with the rest of the bridge.
- `package.json`: `dev:mock` sets `BRIDGE_MOCK_PRINTER=1` too.

### 5. Print test page (field setup aid)

A staff button that renders `ProtocolDocument` with a fixed sample markdown and meeting ID
`0`, then POSTs it with `?meetingId=0&test=1`. The bridge adds a timestamp to test keys so
test pages are never treated as duplicates. Staff get a one-click check that the whole
browser → bridge → CUPS → paper chain works without running a meeting.

### 6. Install and docs

- `install/macos/com.council.button-bridge.plist`: add `BRIDGE_PRINT_SPOOL_DIR` =
  `/Users/Shared/Council Print`.
  - **Not the install folder:** `install.sh` runs `rm -rf $INSTALL_DIR/*` on every install,
    and `uninstall.sh` removes the whole folder, so updates would wipe the kept `done/`
    archive and any waiting jobs. The install folder is also owned by root, so staff
    couldn't copy a PDF back into `pending/` to reprint.
  - **Not the Desktop:** macOS privacy protection (TCC) covers `~/Desktop`, and it can
    silently stop a root daemon from writing there without Full Disk Access.
  - `/Users/Shared` isn't privacy-protected, survives updates, and every user can edit it.
- `install.sh` and `install-release.sh`: create the spool folder (staff-writable), and add
  a Desktop shortcut for the console user, `ln -s "/Users/Shared/Council Print"
  ~<user>/Desktop/`, owned by that user. Uninstall removes the shortcut but leaves the
  folder and its archive alone. If `lpstat -d` reports a
  default printer, run `lpadmin -p <default> -o printer-error-policy=retry-job`. Otherwise
  print a warning telling staff to set a default printer.
  - **Gotcha:** macOS's "Default printer: Last printer used" is a per-user setting, and the
    daemon runs as root. Staff should pick a fixed default in System Settings → Printers,
    or install with `sudo lpadmin -d <printer>`, or set `BRIDGE_PRINTER` in the plist.
    Document this.
- MUSEUM.md: add the Print summaries toggle to the staff page section and to the
  "Physical talk button" install preset, plus a short "Printer" setup and troubleshooting
  section: reprint by copying a file from `done/` to `pending/`, and `cupsenable
  <printer>` for a stopped queue.
- Bridge README: the endpoint, env vars, and mock printer.

### 7. Tests (following TESTING.md)

Bridge, integration level: real HTTP against the bridge with `MockPrinter` and a temp
spool folder. Extend `tests/integration.test.ts` or add `tests/print.test.ts`.

- POST a valid PDF → 202, printed exactly once, file ends up in `done/`.
- POST the same meeting twice, including while the first is still printing → one print,
  second response is `duplicate`.
- Same meeting ID from two origins → two prints.
- Start the bridge with a file already in `pending/` → it prints (self-healing).
- Printer in `fail` mode → the file stays in `pending/`. Switch to `ok` → it prints.
- A table of rejections: non-PDF body, non-numeric ID, oversize, disallowed origin → no
  file written.
- `/health` includes the `print` block.
- `LpPrinter` argument building and `lpstat` parsing: one table-driven unit test on
  captured `lpstat` output samples.

Client:

- `SummaryPrintJob`/`printClient` behaviour with `fetch` mocked. A table over
  live/replay × toggle on/off × capability on/off, where only live + on + on POSTs. A
  summary message that re-renders or is delivered again after reconnect → one POST. The
  bridge unreachable, then reachable → one POST succeeds.
- Capability table: `printSummary` is true only for museum. Extend the existing
  capabilities test if there is one.
- Staff toggle persistence: extend `tests/unit/settings/councilSettings.test.tsx` and
  `Staff.test.tsx` next to the hardware button cases, not in a new file.
- Don't assert the PDF contents. `renderProtocolPdf` stays a thin wrapper around jsPDF.

## Developing without a printer

Three levels, from fastest to most realistic:

1. **Mock printer** (day-to-day): `cd button/bridge && npm run dev:mock`. PDFs land in
   `button/bridge/.print-spool/mock-printed/`, so you can open them to check layout.
   `curl -X POST localhost:8765/v1/test/printer -d '{"mode":"fail"}'` simulates an outage.
   To exercise the bridge without the client:
   ```bash
   curl -X POST -H 'Content-Type: application/pdf' --data-binary @some.pdf \
     'http://127.0.0.1:8765/v1/print?meetingId=42'
   ```
2. **Real CUPS with a fake network printer**, to test `lp`, `lpstat`, the error policy, and
   stopped queues. Netcat plays the printer:
   ```bash
   sudo lpadmin -p CouncilFake -E -v socket://127.0.0.1:9100 \
     -P /System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/PrintCore.framework/Versions/A/Resources/Generic.ppd \
     -o printer-error-policy=retry-job
   nc -l 9100 > /tmp/printed.ps       # "printer on"; stop nc to simulate "printer off"
   BRIDGE_PRINTER=CouncilFake npm run dev
   ```
   Remove it afterwards with `sudo lpadmin -x CouncilFake`.
   **Don't use `Xerox_Transit_Printer`** (currently this Mac's default): jobs would sit in
   its queue and come out the next time it's connected.
3. **Client end to end:** client dev server plus the mock bridge. On `#staff`, choose
   Museum and turn on Print summaries, then use **Print test page**, or run a meeting
   against the server's mock/fast mode.

## Open items to verify during implementation

- **Chrome Local Network Access:** an https page calling `127.0.0.1` needs the site's
  local network permission. The install already grants it for `/health` and the WebSocket,
  so it should cover the POST too. Confirm on the install Mac, and add it to the staff
  checklist.
- **A4 layout:** the template is 480px wide with 50pt margins, written for a download, not
  paper. Print one real protocol before opening, and check page breaks, logo, and QR code.
- **Forest:** the download filename hardcodes "Council of Foods". Use `t('app.council')`
  while extracting, so the change merges cleanly into `forest-leo`.
- **Next step, paper-out email:** the bridge already polls printer state reasons
  (`media-empty`, `media-jam`, `offline`). Add an alerter that emails once when a reason
  appears and once when it clears (SMTP config in the plist, rate-limited). Also alert
  when `pending/` jobs are older than N minutes.
