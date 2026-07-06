# Museum installs

How to run Council of Foods (or Forest) as a physical kiosk: app mode, voice
agent, hardware button, and field setup.

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
    ├── Council client (museum mode)
    └── ws://127.0.0.1:8765  ← button bridge (on the Mac)

Arduino button ──USB──► button bridge daemon (launchd on install Mac)
```

| Piece | Doc |
|-------|-----|
| Button firmware | [button/arduino/README.md](button/arduino/README.md) |
| Bridge daemon (dev + Mac install) | [button/bridge/README.md](button/bridge/README.md) |
| Button stack overview | [button/README.md](button/README.md) |
| Server / deploy | [server/README.md](server/README.md), root [README.md](README.md) |

---

## 1. Browser kiosk

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
| **Web** | Normal online UI — navbar, manual voice-guide controls, fullscreen button |
| **Museum** | Visitor-facing chrome hidden; voice guide auto-starts; optimized for kiosk |

Switching museum → web does **not** reload the page or end an in-progress meeting.

### Agent mode

| Mode | Use |
|------|-----|
| **Always-on** | Mic open during setup voice guide (no button required) |
| **Push to talk (PTT)** | Visitor holds button (or Space in dev) to speak — used with hardware button |

In museum mode, choosing **Museum** automatically enables an agent mode if it was
off (defaults toward always-on). For physical buttons, choose **PTT** and enable
**Hardware button** below.

### Hardware button (PTT only)

When **Push to talk** + **Hardware button** are on:

- The app connects to the bridge at `http://127.0.0.1:8765`
- Staff page shows **Bridge** / **App** / **USB** status chips
- Press the staff preview area to test LED (`pulse` while idle, `on` while held)

Install and service the bridge daemon per
[button/bridge/README.md](button/bridge/README.md) (GitHub release install or
`install/macos/install.sh` from a checkout).

### Museum switch button (staff escape)

Enable **Museum switch button** on the staff page to show a red-bordered preview
of the top-left hit target. In production the control is invisible; staff click
top-left to toggle **museum ↔ web** without reload.

### Dev logging

Optional category toggles on `#staff` for field debugging (`localStorage`-backed).

---

## 3. Typical install presets

### Voice-only kiosk (no USB button)

1. Chrome kiosk → deployed URL  
2. `#staff` → **Museum** + **Always-on**  
3. Hide staff URL from visitors; use museum switch button for recovery  

### Physical talk button (recommended for council meetings)

1. Flash firmware → install bridge (`launchd`) → verify `curl http://127.0.0.1:8765/health`  
2. Chrome kiosk → deployed URL  
3. `#staff` → **Museum** + **PTT** + **Hardware button**  
4. Confirm bridge **Connected** and LED **pulse** on the button  
5. Enable **Museum switch button** for staff  

During a live meeting in museum PTT, the button also drives human input and the
meta-agent (chair) when those phases are active.

---

## 4. Idle autoplay (museum only)

If nobody interacts for long enough, the install can leave interactive mode and
loop **completed meeting replays** (no live AI cost). A short warning appears
first; the hardware button can extend or exit. Configured server-side
(`GET /api/autoplay`); only runs when **Museum** mode is on.

---

## 5. Field checklist

Use the hardware checklist in
[button/bridge/README.md](button/bridge/README.md#hardware-test-checklist-for-field-tester):

1. Bridge daemon running (`launchctl` or `npm run dev`)  
2. USB connected — serial path in bridge log  
3. `curl http://127.0.0.1:8765/health` → OK  
4. App `/#staff` → PTT + hardware → **Connected**  
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

Open `http://localhost:5173/#staff`, set **Museum** + **PTT** + **Hardware
button**. Playwright e2e: `cd client && npm run e2e` (starts mock bridge).

---

## Related WIP engineering plans

These are implementation plans, not install runbooks:

| Doc | Topic |
|-----|--------|
| [docs/museum-kiosk-resilience-plan.md](docs/museum-kiosk-resilience-plan.md) | Deploy recovery, health probe before reload, host watchdog |
| [docs/agent-error-handling-plan.md](docs/agent-error-handling-plan.md) | Voice guide / meta-agent errors → main error UI |
| [docs/voice-guide-tools-plan.md](docs/voice-guide-tools-plan.md) | Voice guide tools and UI state sync |
