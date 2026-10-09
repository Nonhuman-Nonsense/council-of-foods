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

## 1. Browser: the kiosk windows

The app does **not** call `requestFullscreen()`. Chrome's kiosk mode keeps it full
screen, so the visitor sees only the council UI. Use the deployed URL for this install
(production or staging); language follows the URL prefix (`/en`, `/sv`, …) like the
public web app.

[museum/kiosk/](museum/kiosk/) runs the council window, and the
[meter](#meter-screen-second-display) on a second screen, as launchd agents of the
logged-in user:

```bash
museum/kiosk/install.sh --council-url https://<host>/sv --meter-url "https://<host>/meter?venue=<venue-id>"
```

Leave out `--meter-url` for a single screen. Run it again to change a setting or to
update. No `sudo` needed.

Each window, at login:

1. **Waits for its screen:** the council takes the main screen (the one with the menu
   bar), the meter the other one. Where they sit in Displays → Arrange does not matter.
2. **Waits for the server** to answer `/health`, so it never opens on Chrome's error page.
   If it hasn't answered after 15 s, the screen says why, from a page on the Mac
   (`offline.html`, English): **No network** (no cable or Wi‑Fi), **No internet** (a network,
   but no internet), or **Server error** (the internet works; nothing to do on site). The
   council opens by itself as soon as the server answers.
3. **Opens Chrome in kiosk mode** on that screen, in a Chrome profile of its own (in
   `~/Library/Application Support/council-kiosk/`), starting from a single tab.

When Chrome closes, for whatever reason, it opens again 10 s later. If the meter's
screen goes away (switched off, unplugged), its window closes, instead of macOS moving
it on top of the council, and opens again when the screen is back.

The screens may come on in any order. A Mac started with only the meter's screen on makes
that the main screen, so the council opens there; when the projector comes on, macOS makes
it the main screen again, and the council moves to it by itself: a window whose screen has
changed for 10 s closes and opens again on its screen. Chrome can miss full screen on a
screen that is still settling, so a window that does not fill its screen for a minute opens
again too. With a projector the Mac has not seen before, check once that it gets the menu
bar (Displays → Arrange, drag the menu bar onto it); macOS remembers that for the next time.

**Watchdog.** In museum and presenter mode, and always on the meter, the page ticks a
counter in its title every 10 s (the `kioskHeartbeat` capability; a kiosk never shows
the title). The window script reads it every 30 s from Chrome's debugging port (9222
for the council, 9223 for the meter; this Mac only). A page that ticked and then stood
still for 2 minutes has crashed (`Aw, Snap!`), hung, or been replaced by an error page,
so Chrome restarts. A page that never ticked, like the council in web mode before
`#staff` is set up, is left alone.

**The pointer** hides once it has stood still for 3 s, on the council in museum and presenter
mode and always on the meter, and shows again when the mouse moves. macOS only applies that
while the window's Chrome is the app in front, so the window with the pointer on its screen
takes the front: at once from the other kiosk window or Finder, and from any other app (a
mouse's helper app that starts at login, say) once nobody has used the Mac for a minute.

| | |
|---|---|
| Use the Mac (`#staff`, Settings) | `museum/kiosk/stop.sh`; the windows come back with `museum/kiosk/start.sh` or a restart |
| Remove | `museum/kiosk/uninstall.sh` (keeps the profiles; `--purge` removes them) |
| Logs | `~/Library/Logs/council-kiosk-council.log`, `council-kiosk-meter.log` |
| Try it on a desk | `--windowed`: ordinary windows instead of kiosk |

The council's `#staff` settings and microphone permission belong to its kiosk profile.
After the first install, `stop.sh`, then open that profile at the staff page and set
it up (and allow the microphone once, on the first meeting):

```bash
open -na "Google Chrome" --args --user-data-dir="$HOME/Library/Application Support/council-kiosk/council-chrome" "https://<host>/#staff"
```

Quit that Chrome, then `start.sh`. Extra Chrome flags for the council go in
`--council-flags "..."`.

**Text size.** If subtitles and text read too small from where visitors stand, zoom in
with Cmd + in that same profile while it is open for setup. Chrome keeps the zoom per
site in the profile, next to the `#staff` settings, so it lasts through restarts and
Chrome updates and goes only with the profile (`uninstall.sh --purge`) or a change of
host in the URL. Nothing on screen shows it, so write the level you chose into the
venue's setup notes. Keep the page at least 600 px tall after zoom: below that the
app switches to its small-screen layout, with smaller text. On a 1080p screen that
means 175% at most.

### The Mac itself

Once, in System Settings:

- **Users & Groups:** log in automatically, as the user the kiosk is installed for.
- **Energy:** start up automatically after a power failure (or `sudo pmset autorestart 1`);
  prevent automatic sleeping when the display is off.
- **Lock Screen:** turn the display off **Never**; no screen saver.
- **Wallpaper:** plain black, so a window between restarts leaves the screen black.
- **General → Software Update → Automatic updates:** off, so the Mac never restarts into
  an update during opening hours.
- **Notifications:** Focus on, or notifications off, so nothing slides over the screens.
- **General → Login Items:** nothing that opens Chrome (an old `council-meter.command`
  would open a second meter), and turn off reopening windows when logging back in.
  Under **Allow in the Background**, leave the kiosk windows on: macOS announces them
  once at install ("can run in the background"), and turned off they never start.

**Shutting down without a mouse or keyboard:** press the power button once. On a Mac mini
(or any Mac without a battery) the bridge installer sets this up: the Mac shuts down
properly, and a protocol waiting to print prints after it starts again. Holding the button
down for 10 seconds still forces it off. A macOS update can break the power button shutdown
silently (see [button/bridge/README.md](button/bridge/README.md#museum-mac-install-persistent)),
so press it once after every update.

---

## 2. Staff page (`#staff`)

Open `https://<your-origin>/#staff` on the install machine (bookmark it for
field staff). Settings persist in `localStorage` on that browser profile.

In **Museum** and **Presenter** mode, a keyboard reaches it without a mouse: **Cmd+S**
(Ctrl+S off the Mac) opens it, **Tab** moves between controls, **Enter** presses one, and
**Esc** closes the page. Space is not a click here — it stands in for the talk button,
so staff can test a press. In Web mode the shortcut is off; open `#staff` by URL.

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

In a meeting that ends in a letter, the letter is what prints — and only if the
visitor was there to answer when asked to add something. With printing on, the letter is
not read aloud or shown on screen: the chair thanks the author and the visitor, says the
email was sent and is printing behind them (or that it was not sent, because nobody
answered), and every meeting ends on the same **credits** — "Thank You", then a
60-second roll — while the letter prints, 20 seconds after it is ready
(`LETTER_PRINT_DELAY_MS` in `SummaryPrintJob.tsx`). The button or a click starts a new
meeting; otherwise the start page returns 20 seconds after the credits. Replays skip
the chair's farewell and the credits and show the letter. **Replies** to the letters
print here too, as they arrive: the page asks the bridge for new replies to this
venue's letters once a minute (the bridge asks the council server with the
installation key, so the key and the venue must be set), prints each once, and
tells the server. Automatic replies (out of office) are never printed. See
[docs/council-letters.md](docs/council-letters.md).

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
- Printing goes to the Mac's **system-wide default printer**. Choosing a default in
  System Settings → Printers & Scanners only sets it for that user, and the bridge
  runs as root, so it doesn't see it. Choose a fixed default there, not "Last printer
  used", then re-run the bridge installer: it makes that printer the system-wide
  default and applies the retry setting. To change it without the installer, run
  `sudo lpadmin -d <printer name>` (`lpstat -e` lists the names); the bridge picks it
  up within seconds.

### Printer alert emails

When the printer needs attention, museum staff get an email from
`council@council-of-foods.com` (or `council-of-forest.com`), plus a copy to our
errorbot on Telegram:

- **Needs attention**, once a problem has lasted 2 minutes: out of paper, a jam, an
  open cover, a paused queue, a protocol that hasn't printed for 10 minutes, or no
  printer. A different problem sends a new email.
- **Reminder** every 4 hours while it lasts, only during the venue's opening hours,
  plus one when the venue opens.

Once it has stayed fixed for 2 minutes, only errorbot hears that it works again; staff
aren't emailed.

**Who gets them:** the installation's **venue**, chosen on `#staff` (Installation panel →
Venue). The page hands it to the bridge.
Venues and their addresses are set on the council server, so staff can only choose
among them, never type an address. The panel shows the masked addresses,
**Alert emails: On / Choose a venue / Failing / No installation key**, and a
**Send test alert** button (once a minute).

**Installation key:** the bridge needs the council server's `COUNCIL_INSTALLATION_KEY`
to send alerts, the same key the room power plugs use. Paste it once on `#staff`
(Installation panel → **Installation key** → **Save**). The server checks it before the
bridge keeps it, and the bridge keeps it for that server only, readable by root alone;
nobody can read it back. **Saved for <another server>** means it was entered on a
different council server's page: enter this server's key.

**Adding or changing a venue** is a server config change: edit `COUNCIL_VENUES`
in the server's environment and redeploy. Each venue has an id, name, alert
addresses, timezone and one weekly opening window:

```json
[{"id":"example-museum","name":"Example Museum","alertEmails":["staff@example.org"],
  "timezone":"Europe/Stockholm","openingHours":{"days":["wed","thu","fri","sat","sun"],"from":"12:00","to":"16:00"}}]
```

Holidays and closed weeks aren't modelled. The worst case is a reminder on a closed day.

**Nothing is sent if the Mac, the bridge or the internet is down.** Staff notice
that by the black screens (see section 7).

### Network log

Once the installation key and venue are set (see above), the bridge measures the Mac's
network every minute and sends it to the council server: 5 pings to the router and to the
internet (1.1.1.1), how long one request to the council server takes, the network
interface's error counters and its link speed. While the internet is down the samples wait
on the Mac (up to a day) and go up together once it is back.

When they show the internet gone for 2 minutes or more, errorbot hears about it afterwards,
with how long it lasted and whether the router still answered. If it did, the problem is
the venue's internet connection. If it didn't, it's the local network: cable, switch or
router.

Read it back from `server/`:

```
npm run network -- --venue havremagasinet               # the last 24 hours, by the hour
npm run network -- --venue havremagasinet --since 7d
npm run network -- --venue havremagasinet --since 2h --minutes
```

Slow or lossy pings to the **internet** while the router answers well point at the
connection or a congested line (visitor Wi-Fi sharing it, say). Loss or slow pings to the
**router** point at the local network. **Interface errors**, or a link that drops from
1000baseT to 100baseTX or goes `inactive`, point at the cable or the port.

### Venue and footprint meter

**Venue** (Installation panel) is where this installation runs, chosen from the
server's `COUNCIL_VENUES`. One choice sets everything that belongs to the place:
who gets printer alert emails, the tag on the AI usage of meetings run here, and
which meetings idle autoplay replays: the ones held at this venue, or any venue's
until this one has a finished meeting in the current language.
(Room power plugs are placed at a venue in `COUNCIL_VENUES` itself, not here.) A bridge that already had a venue passes it
to the page, so existing installations don't need to choose again.

The second screen shows what the installation costs:

- **Meter:** `https://<host>/meter?venue=<id>`, full screen on the second
  display (setup below).
- **Methodology:** `/meter/methodology`, linked by the QR code on the meter.

Design and estimation method: [docs/ai-footprint-meter.md](docs/ai-footprint-meter.md).

### Meter screen (second display)

The meter is a tall strip: it expects a portrait window (e.g. 864×2880). It runs in
its own Chrome instance, so it never shares full screen, zoom or tabs with the
council.

1. **Rotate the display in macOS:** System Settings → Displays → select the meter
   screen → **Rotation** 90° (or 270°, whichever puts the image upright on how it
   hangs).
2. **Open it there:** install the [kiosk windows](#1-browser-the-kiosk-windows) with
   `--meter-url "https://<host>/meter?venue=<venue-id>"`. The meter finds this screen by
   itself.
3. **Check:** numbers move during a meeting (or plugs report), the QR code opens the
   methodology page on a phone, and the pointer hides on the meter once it stands still.

The meter looks after itself: when its connection comes back after a network drop
or a server restart (a deploy included) it reloads the page, so it also runs the new
code; after a crash it stays black for 30 s, then reloads; and it reloads every night
at 04:00. Each time it first waits until the server answers `/health`, so it never
lands on Chrome's error page. It needs no restart. If macOS cannot rotate the screen (some USB-C displays refuse),
leave it landscape and add `&rotate=90` (quarter turn clockwise) or `&rotate=-90`
(anticlockwise) to the URL instead; the layout is the same.

### Room power plugs

Shelly smart plugs (Plug S Gen3, Plug M Gen3, Plug PM Gen3 or any Gen2+ plug with
power metering) measure the room's electricity for the meter's **In this room**
section. Use one plug per group of devices, e.g. projector / computer and meter
screen / sound; any number works.

Each plug has a **number**, marked on it. The plug only knows its number; which venue
it is at and what it powers there is set on the server, so a plug is set up once and
never touched again when the installation moves.

**Setting up a plug (once):**

1. Plug in, add it to the installation router's Wi-Fi with the Shelly app or its own
   access point. A Shelly cloud account is not needed.
2. In the plug's settings, set it to **turn on after power loss** and never switch it
   off: a lamp projector must be able to cool down. Set **Device name** to end in its
   number, e.g. `CouncilPlug-2` (numbers unique across all installations using the same
   server), and mark the number on the plug.
3. Open the plug's web page (`http://<plug-ip>/`) → **Scripts** → create a script,
   paste [scripts/shelly/room-power.js](scripts/shelly/room-power.js), and fill in
   the server URL and the installation key (`COUNCIL_INSTALLATION_KEY`); every plug runs
   the same script. Save, **Start**, and enable **Run on startup**.
4. Set a password for the plug's web page (Settings → Authentication). The script holds
   the installation key, which also sends printer alerts, and the page is otherwise open
   to anyone on the router's Wi-Fi.
5. The script's console on the plug's web page shows any failed request, e.g. a plug
   not yet at any venue.

**Placing plugs at a venue:** list them in the venue's entry in `COUNCIL_VENUES`,
`"plugs": [{ "plug": 1, "label": "Projector" }, { "plug": 2, "label": "Computer" }]`,
and restart the server. Within a few seconds they appear on that venue's meter.

**Moving the installation:** move its plugs to the new venue's entry *before* plugging
in there, and restart the server. What they measured stays with the old venue; the new
venue counts from zero. **Replacing a broken plug:** give the new one the same number;
it takes over once the old one has been silent for 20 seconds. Two plugs reporting the
same number at once are refused ("already reporting from …" in the newer one's console).

The server needs `COUNCIL_INSTALLATION_KEY` (16+ characters) in its environment;
without it, plug reports are refused. A plug that stops reporting drops off the meter
after 20 seconds, and its energy so far stays in the total. A plug offline for a while
catches up with its next report, since it sends its own running counter. The counter
restarts from zero after a power cut, and the plug's uptime tells the server so: plugs set up
before October 2026 need the current script pasted in again to send it. Each plug's energy is also
kept per hour, for later questions (from a date, per day, open hours versus night).

### Split audio

Turn on **Split audio** on the staff page to feed two places from the Mac's one audio output.
The output's two channels become two mono feeds: the **left** carries the scene alone (the
ambience and the beings' sounds), the **right** the full mix, voices included. A Y-cable from
the headphone jack (3.5 mm stereo to 2× mono, RCA or 6.35 mm) takes each side to its own amp
or speaker. The setup and meeting agents speak on the right too, with the council. The switch
takes effect at once, without a reload; off, the output is the usual stereo mix.

- Each side is mono. A mono plug into a stereo headphone amp plays in one ear only, so give
  headphones an amp with a mono input, or a mono-to-both-ears adapter.
- The Mac's volume moves both sides together; set each side's level on its amp.
- macOS can quietly undo the split: keep System Settings → Accessibility → Audio → **Play
  stereo audio as mono** off, and the Sound balance slider centred.
- Leave it off on any screen someone listens to in headphones: they would hear the voices in
  one ear only.
- With the split on, the microphone opens without the browser's echo canceller, which coloured
  the agents' voices. Keep speakers that play voices away from the mic, or the agents may hear
  themselves. This part follows the switch only when the mic next opens: reload the page.

### Hear yourself

Set **Hear yourself** on the staff page to let a visitor in headphones hear their own voice
while they hold the talk button, as in a radio studio. They hear it only while the button is
down, and what they hear is the same cleaned-up signal the agents transcribe, so staff
listening in hear what the AI hears. The level steps from off to 100 %; set the rest on the
headphone amp. With **Split audio** on it plays on the right side only, with the voices.

- Headphones only. Over speakers the mic hears itself and howls; leave it off at a screening.
- Turn off any direct monitoring on the audio interface, or the visitor hears themselves twice.
- It comes back a little late (a few tens of milliseconds), which can sound like a faint
  doubling. A lower level makes it less noticeable.
- After switching it on, check that transcripts still come out right: the browser's echo
  canceller hears this playback too.

### Mode switch button (staff escape)

Enable **Mode switch button** on the staff page to show a red-bordered preview
of the top-left hit target. In production the control is invisible; staff click
top-left to toggle **web ↔ the last installation mode selected** (museum or
presenter) without reload.

### Dev logging

Optional category toggles on `#staff` for field debugging (`localStorage`-backed).

While logging is on, everything the console prints is also stored on the council server, so
an installation's log can be read after something went wrong — nobody has to have had
DevTools open. There is no separate switch; it follows the category toggles: what is stored
is exactly what is printed. A line under the switch appears only when sending fails. Lines
are batched every 5 s and kept while the server is unreachable. The server keeps the newest 512 MB (the `client_log` collection is
capped, so it never needs pruning).

Read it back from `server/` (it reads the database the server's `.env` names):

```
npm run logs -- --venue havremagasinet --unanswered --since 24h
npm run logs -- --setup <setupId>
npm run logs -- --page <pageId>
npm run logs -- --range
```

The realtime agents log each visitor turn and each reply as one line (`turn: answered`,
`reply: completed`, with the transcript, the wait and the tools called), and `[SUBS] AUDIO`
lines where the agent's audio really starts and pauses — read those against the captions'
`DISPLAY` lines when captions drift. `--unanswered` lists the turns the agent decided to
answer that no reply ever followed: where it froze, with the setup id and page id to look up.

---

## 3. Typical install presets

### Voice-only kiosk (no USB button)

1. [Kiosk windows](#1-browser-the-kiosk-windows) → deployed URL  
2. `#staff` → **Museum**  
3. Hide staff URL from visitors; use the mode switch button for recovery  

### Physical talk button (recommended for council meetings)

1. Flash firmware → install bridge (`launchd`) → verify `curl http://127.0.0.1:8765/health`  
2. [Kiosk windows](#1-browser-the-kiosk-windows) → deployed URL  
3. `#staff` → **Museum** + **Hardware button**  
4. Confirm bridge **Connected** and LED **pulse** on the button  
5. Enable **Mode switch button** for staff  

During a live meeting, the button also drives human input and the meta-agent
(chair) when those phases are active.

### Printed protocols

1. Connect the A4 printer and make it the Mac's default printer (System Settings →
   Printers & Scanners)
2. Install (or re-install) the bridge. It sets up the print folder, the Desktop
   shortcut, makes the printer the system-wide default (the bridge doesn't see a
   default that's only yours) and sets its retry setting
3. `#staff` → **Museum** + **Print summaries**. The Bridge panel shows the printer as **Ready**
4. **Print test page**, and check a page comes out
5. Installation panel → **Venue** → choose the museum, and paste the **Installation key**
   (`COUNCIL_INSTALLATION_KEY` on the council server) → **Save**
6. Bridge panel → **Send test alert**, and check the inbox

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
7. Meter screen upright, full screen, numbers moving; room plugs listed if installed  
8. Restart the Mac → both windows come back on their screens, untouched  
9. With **Split audio** on: the left side plays no voices, the right side plays everything  
10. With **Hear yourself** on: holding the button, the visitor hears their own voice in the
    headphones; released, nothing; the transcript still comes out right  
11. Press the Mac's power button once → it shuts down by itself (the bridge log says
    `power button pressed`); start it again → everything comes back  

Bridge logs: `/var/log/council-button-bridge.log`; kiosk logs:
`~/Library/Logs/council-kiosk-*.log`

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

## 7. What recovers what

| Failure | Recovered by |
|---|---|
| Socket drop, failed generation, server restart or deploy | The app: reconnects, retries, and reloads once `/health` answers ([RESILIENCE.md](RESILIENCE.md)) |
| Meter: deploy, crash while drawing, months of uptime | The meter: reloads on reconnect, 30 s after a crash, and nightly at 04:00 |
| Crashed or hung tab, Chrome error page, Cloudflare 502 page | The kiosk watchdog: restarts Chrome when the heartbeat stops |
| Chrome quits, crashes or hangs | The kiosk window: opens Chrome again, once the server answers |
| Meter screen switched off or unplugged | The kiosk window: closes the meter until the screen is back |
| Power cut, Mac restart | The Mac: starts after a power failure, logs in, opens the windows |
| Internet or server down | Nothing on site: the screens say which, and the app comes back by itself when it's back. In a running council the reconnect overlay says **No internet** at once, or **Can't reach the server** after 30 s |

Every reload and reopen waits for `/health` first, so nothing lands on Chrome's error
page while the server is down; the screens wait, black, instead.

What none of this reaches: a Mac that hangs, a screen that stays black while still
connected, and the network or server being down for good. Nothing emails anyone about those;
staff notice them on the screens (black, or saying the connection is down), and need a
person to fix them.
