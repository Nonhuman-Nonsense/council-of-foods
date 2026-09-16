# Installations

How to run Council of Foods (or Forest) on dedicated hardware — an unattended
museum kiosk, or a live screening someone presents: app mode, voice agent,
hardware button, and field setup.

An **installation** is any run where the app owns the whole screen on hardware
the visitor does not own. That is the line the app draws: `web` is someone's own
browser; `museum` and `presenter` are installations, and share their chrome,
their voice-driven setup, and their reload behaviour.

**Branches:** Museum work ships on `foods-leo` (Council of Foods) and merges to
`forest-leo` (Council of Forest). Install URLs differ by product; bridge and
staff setup are the same pattern.

| Product | Typical deploy origin |
|---------|----------------------|
| Council of Foods | `council-of-foods.com` |
| Council of Forest | `council-of-forest.com` |

---

## Stack overview

```
Visitor browser (Chrome, fullscreen/kiosk)
    ├── Council client (museum or presenter mode)
    └── 127.0.0.1:8765  ← bridge (on the Mac): button socket + protocol printing

Arduino button ──USB──► bridge daemon (launchd on install Mac) ──lp──► printer
```

| Piece | Doc |
|-------|-----|
| Button firmware | [button/arduino/README.md](button/arduino/README.md) |
| Bridge daemon (dev + Mac install) | [button/bridge/README.md](button/bridge/README.md) |
| Button stack overview | [button/README.md](button/README.md) |
| Server / deploy | [server/README.md](server/README.md), root [README.md](README.md) |

---

## 1. Browser

The app does **not** call `requestFullscreen()`. Use Chrome or OS kiosk mode on
the install Mac so the visitor sees only the council UI.

Open the deployed URL for this install (production or staging). Language follows
the URL prefix (`/en`, `/sv`, …) like the public web app.

---

## 2. Staff page (`#staff`)

Open `https://<your-origin>/#staff` on the install machine (bookmark it for
field staff). Settings persist in `localStorage` on that browser profile.

### Installation mode

| Mode | Use |
|------|-----|
| **Web** | Normal online UI — navbar, manual setup agent controls, fullscreen button |
| **Museum** | Visitor-facing chrome hidden; setup agent auto-starts; optimized for unattended kiosk |
| **Presenter** | Museum look and flow for performative screenings, with nothing on a timer |

Switching between modes does **not** reload the page or end an in-progress meeting.

### Presenter mode

For screenings where someone stands next to the app and talks about it. Same
chrome, teleprompter summary, meta agent and push-to-talk as museum — but the
four behaviours that drive the app forward on their own are off:

| Off in presenter | What museum would have done |
|---|---|
| Idle autoplay | After 90s idle, leave interactive mode and loop replays |
| Summary auto-return | Leave the summary for the landing page 20s after the reading |
| Idle turn abandonment | Skip a human turn the visitor walked away from |
| Setup agent idle nudge | Ask "are you still there?", then drop the session after 3 min |
| Auto-restart | Reload after a prolonged disconnect; count down to restart on the error screen |

Self-healing stays on: infinite retry, resume after a tab switch, and a blocking
reconnect overlay, so a hiccup mid-screening recovers without anyone touching a
keyboard. The error screen offers a plain **Restart** button instead of a
countdown.

`client/src/settings/capabilities.ts` is the full, authoritative answer for what
each mode does — every difference between the three is one row of that table,
and nothing in the app branches on the mode itself.

### Hardware button

Museum and presenter both run the setup agent with push-to-talk; there is no
separate agent-mode setting. The hardware button is independent of the mode — a
laptop in web mode can drive a real button for testing.

When **Hardware button** is on:

- The app connects to the bridge at `http://127.0.0.1:8765`
- Staff page shows **Bridge** / **App** / **USB** status chips
- Press the staff preview area to test LED (`pulse` while idle, `on` while held)

Install and service the bridge daemon per
[button/bridge/README.md](button/bridge/README.md) (GitHub release install or
`install/macos/install.sh` from a checkout).

### Printing protocols

With **Print summaries** on, museum mode prints the protocol of every **live**
meeting on the Mac's printer as soon as the summary is ready. That includes
resumed meetings and meetings the visitor walked away from. Replays and
idle-autoplay never print, and neither do presenter or web mode. Nothing appears
on screen.

The browser sends the PDF to the bridge. The bridge keeps it in a folder queue and
prints it with macOS's own printing, so a crash, a reboot or a printer that is
off only delays a protocol, never loses it. Each meeting prints once.

The **Bridge** panel on `#staff` shows the printer, how many protocols are
waiting, and **Needs attention** with the reason when something is wrong: out of
paper, a jam, a paused queue, or protocols that haven't printed for 10 minutes
even though the printer reports nothing. The printer's own message is under
**Details**.
**Print test page** sends a sample protocol along the same path.

The folder is **`/usr/local/lib/council-button-bridge/print`**, with a **Council Print**
shortcut on the Desktop:

| Folder | Contents |
|---|---|
| `pending/` | Waiting to print. Empties by itself once the printer works. |
| `done/` | Every protocol printed, kept indefinitely. |

- **Reprint** a protocol: copy it from `done/` into `pending/`.
- **Stop** a protocol from printing: move it out of `pending/`.
- **Printer stuck** after paper out or a jam: fix the printer. The installer sets
  it to retry on its own. If the panel still says **Stopped**, resume it in
  System Settings → Printers & Scanners, or run `sudo cupsenable <printer name>`.
- Printing goes to the Mac's **default printer**. Set a fixed default in System
  Settings → Printers & Scanners, not "Last printer used", then re-run the bridge
  installer so the retry setting is applied to it.

### Printer alert emails

When the printer needs attention, museum staff get an email from
`council@council-of-foods.com` (or `council-of-forest.com`), plus a copy to our
errorbot on Telegram:

- **Needs attention**, once a problem has lasted 2 minutes: out of paper, a jam, an
  open cover, a paused queue, a protocol that hasn't printed for 10 minutes, or no
  printer. A different problem sends a new email.
- **Reminder** every 4 hours while it lasts, only during the venue's opening hours,
  plus one when the venue opens.
- **Working again** once it has stayed fixed for 2 minutes.

**Who gets them:** the **venue** chosen on `#staff` (Bridge panel → Venue).
Venues and their addresses are set on the council server, so staff can only choose
among them, never type an address. The panel shows the masked addresses,
**Alert emails: On / Choose a venue / Failing / Not set up on bridge**, and a
**Send test alert** button (once a minute).

**Adding or changing a venue** is a server config change: edit `COUNCIL_VENUES`
in the server's environment and redeploy. Each venue has an id, name, alert
addresses, timezone and one weekly opening window:

```json
[{"id":"example-museum","name":"Example Museum","alertEmails":["staff@example.org"],
  "timezone":"Europe/Stockholm","openingHours":{"days":["wed","thu","fri","sat","sun"],"from":"12:00","to":"16:00"}}]
```

Holidays and closed weeks aren't modelled. The worst case is a reminder on a closed day.

**Nothing is sent if the Mac, the bridge or the internet is down.** That needs a
watchdog outside the Mac (see section 7).

### Mode switch button (staff escape)

Enable **Mode switch button** on the staff page to show a red-bordered preview
of the top-left hit target. In production the control is invisible; staff click
top-left to toggle **web ↔ the last installation mode selected** (museum or
presenter) without reload.

### Dev logging

Optional category toggles on `#staff` for field debugging (`localStorage`-backed).

---

## 3. Typical install presets

### Voice-only kiosk (no USB button)

1. Chrome kiosk → deployed URL  
2. `#staff` → **Museum**  
3. Hide staff URL from visitors; use the mode switch button for recovery  

### Physical talk button (recommended for council meetings)

1. Flash firmware → install bridge (`launchd`) → verify `curl http://127.0.0.1:8765/health`  
2. Chrome kiosk → deployed URL  
3. `#staff` → **Museum** + **Hardware button**  
4. Confirm bridge **Connected** and LED **pulse** on the button  
5. Enable **Mode switch button** for staff  

During a live meeting, the button also drives human input and the meta-agent
(chair) when those phases are active.

### Printed protocols

1. Connect the A4 printer and make it the Mac's default printer
2. Install (or re-install) the bridge. It sets up the print folder, the Desktop
   shortcut and the printer's retry setting
   and, for alert emails, asks for the bridge key (`COUNCIL_BRIDGE_KEY` on the council server)
3. `#staff` → **Museum** + **Print summaries**. The Bridge panel shows the printer as **Ready**
4. **Print test page**, and check a page comes out
5. Bridge panel → **Venue** → choose the museum, then **Send test alert** and check the inbox

### Screening (presenter)

1. Same hardware setup as above  
2. `#staff` → **Presenter** (+ **Hardware button** if using one)  
3. Nothing advances on its own — you drive the pace  

---

## 4. Idle autoplay (museum only)

If nobody interacts for long enough, the install can leave interactive mode and
loop **completed meeting replays** (no live AI cost). A short warning appears
first; the hardware button can extend or exit. Configured server-side
(`GET /api/autoplay`); only runs when **Museum** mode is on — never in
**Presenter**, where an idle app is someone talking about it.

---

## 5. Field checklist

Use the hardware checklist in
[button/bridge/README.md](button/bridge/README.md#hardware-test-checklist-for-field-tester):

1. Bridge daemon running (`launchctl` or `npm run dev`)  
2. USB connected — serial path in bridge log  
3. `curl http://127.0.0.1:8765/health` → OK  
4. App `/#staff` → **Hardware button** → **Connected**  
5. Press button → LED and talk path work in a meeting  
6. Unplug/replug USB → recovers without staff action  

Bridge logs: `/var/log/council-button-bridge.log`

---

## 6. Development (local)

```bash
# Terminal 1 — client
cd client && npm i && npm run dev

# Terminal 2 — server
cd server && npm i && npm run dev

# Terminal 3 — bridge (mock or real USB)
cd button/bridge && npm i && npm run dev:mock   # or npm run dev
```

Open the dev URL at `/#staff`, set **Museum** (or **Presenter**) +
**Hardware button**. With **Print summaries** on, the mock bridge "prints" into
`button/bridge/.print-spool/mock-printed/`. See
[button/bridge/README.md](button/bridge/README.md#printing). Playwright e2e: `cd client && npm run e2e` (starts mock bridge).

---

## 7. Known gap: failures the app cannot reach

Everything above recovers failures that happen **while the app is running** —
socket drops, a failed generation, a deploy that briefly 502s. The client probes
`/health` before reloading so it never reloads into a dead origin.

Nothing in the app can recover the layer below it: a Chrome `ERR_*` page, a
Cloudflare 502/522 served instead of the app, or a hung tab. No client code is
running there, so no client fix reaches it. Recovering those needs a host-level
watchdog on the install machine that reloads the Chrome tab when the origin is
unreachable — planned, not built.

The design work for that (watchdog placement, launchd install, deploy-window
ops, open questions) is in
[docs/museum-kiosk-resilience-plan.md](docs/museum-kiosk-resilience-plan.md),
the one engineering plan still worth returning to. Until it ships, a wedged
install needs a human.
