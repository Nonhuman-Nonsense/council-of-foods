# Council of Foods — installation button

Firmware for the museum buttons using the [Adafruit LED Arcade Button QT](https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino) seesaw family.

## Hardware

- **Arduino Nano R4** (Renesas RA4M1, native USB). The sketch is written for this board only.
- **Adafruit LED Arcade Button 1x4 STEMMA QT** (seesaw, product 5296), on the Nano's Qwiic
  connector with a STEMMA QT / Qwiic cable (JST SH, 4-pin). Either of the breakout's two
  connectors works; the second one is for chaining.
- **Three arcade buttons** on channels 1–3 of the breakout, merged into one button signal
  for the host.

The Qwiic connector is on the Nano's second I2C bus, so the sketch uses `Wire1`; `Wire`
is the A4/A5 header pins. Opening the serial port doesn't reset the Nano R4 (only the
IDE's 1200-baud upload touch does), so reconnects don't reboot the button.

### Long button cable

The Nano and breakout sit together; the buttons are about 10 m away over Cat6 (GX16
connectors at each end). Only the switch and LED wires run over it, never I2C.

Each switch input gets a filter at the **breakout end**, so the long wire doesn't pick up
false presses:

```
breakout V+ ── 4.7 kΩ ──┐
                        ├── breakout switch pad ═══ Cat6 ═══ switch ═══ Cat6 ═══ GND
breakout GND ── 100 nF ─┘
```

Keep each switch wire in a twisted pair with its ground, and the two LED wires of a
button in a pair of their own. Don't plug or unplug the GX16 connectors while powered.

### USB cable

Use a USB-C to USB-C cable from the Mac to the Nano. A cable or adapter that mixes USB-A
and USB-C only works with its **A end towards the computer**: plugged the other way, the
Mac's USB-C port never turns on its 5 V and the Nano stays dark. "Data blocker" adapters
pass power only, so the bridge never sees the Nano.

Use a **direct port or a powered USB hub** on the museum Mac. Avoid USB selective suspend
in the OS power settings.

## LED modes

The browser drives three host modes over serial; the bridge itself can also force a
fourth (`LED_ERROR`) without any browser involved:

| Command | LED behaviour | Button | Sent by |
|---|---|---|---|
| `LED_OFF` | Off | Presses reported (`BUTTON_DOWN` / `BUTTON_UP`); host decides whether to act | Browser |
| `LED_PULSE` | Smooth breathing animation | Presses reported | Browser |
| `LED_ON` | Fully on | Presses reported | Browser |
| `LED_ERROR` | Slow one-at-a-time march (3 s each) | Presses reported | Bridge |

### LEDs on the Nano

The Nano's own LEDs show the same state, for when the buttons are out of sight:

- **RGB LED, red:** mirrors button 1's LED, so it pulses, stays on or goes off with it.
  The one-at-a-time march shows as on for one step, off for two.
- **Orange LED (`LED_BUILTIN`):** on while a button is held, whether or not a host is
  connected. Blinking fast (4× a second) means the button board wasn't found (see
  [Upload](#upload)).

### No host connected

When the **bridge** has not opened the USB serial port:

- Button presses are **ignored** (no `BUTTON_DOWN` / `BUTTON_UP` is sent)
- LEDs cycle one-at-a-time (1 s each) as a **connecting** indicator
- The animation starts automatically whenever the USB link is lost

### Bridge connected, no browser attached

When the bridge has opened the USB serial port but no browser is connected over its
local WebSocket (e.g. blocked by a browser's local-network permission), the bridge
sends `LED_ERROR` itself. This looks like the same one-at-a-time march as the "no
host" state, but slower (3 s/light vs. 1 s/light), so the two are distinguishable.
It's cleared the moment a browser connects and resyncs its LED mode.

After the bridge connects **and** a browser is attached, the app sends `LED_PULSE`
(ready) or `LED_ON` (mic active). Until then the device stays in `LED_OFF`.

## Upload

1. In Arduino IDE, install the **Arduino UNO R4 Boards** package (Boards Manager; it
   includes the Nano R4) and the **Adafruit seesaw Library** with its dependencies
   (Library Manager)
2. On an Apple Silicon Mac, install Rosetta once — the board package's compiler is an
   Intel binary, and without it the build fails with `bad CPU type in executable`:
   `softwareupdate --install-rosetta --agree-to-license`
3. Open `council_button/council_button.ino`, select **Arduino Nano R4** and its port
   (`/dev/cu.usbmodem…`), then upload
4. Optional: open Serial Monitor at **115200 baud**, send `LED_PULSE`, then press a button to verify `BUTTON_DOWN` / `BUTTON_UP`

Close Serial Monitor before starting the bridge — only one program can use the port at a time.

An upload restarts the Nano but not the breakout, which can be left stuck mid-transfer. The
sketch then repeats `ERROR seesaw not found` every second and the bridge's probe fails;
unplug and replug the USB to restart both.

## Serial protocol

| Direction | Message |
|---|---|
| Device → host | `BUTTON_DOWN` (any button pressed, whenever host serial is connected) |
| Device → host | `BUTTON_UP` (all buttons released) |
| Device → host | `READY council-button` (response to `HELLO_COUNCIL`, and on boot) |
| Host → device | `LED_OFF` |
| Host → device | `LED_PULSE` |
| Host → device | `LED_ON` |
| Host → device | `LED_ERROR` (sent by the bridge itself, not relayed from the browser) |
| Host → device | `HELLO_COUNCIL` |

All messages are newline-terminated ASCII. Incoming host lines longer than 32 characters are discarded.

## Museum setup

### First install (once per Mac)

1. Upload this sketch
2. Install the bridge daemon on the museum Mac (Apple Silicon, Node 24+ required):

```bash
curl -fsSL https://raw.githubusercontent.com/Nonhuman-Nonsense/council-of-foods/main/button/bridge/install/macos/install-release.sh | sudo bash
```

Or from a git checkout: `sudo button/bridge/install/macos/install.sh --rebuild`
3. Open the app, go to `/#staff`
4. Enable **Push to Talk**

The bridge owns the USB port. The app connects via `ws://127.0.0.1:8765/v1/button`.

### Day-to-day operation

With the bridge running, the web app **auto-connects in the background** whenever:

- Push to Talk is enabled in `localStorage`, and
- The page is open, and
- The button is plugged in

You do **not** need to visit `/#staff` again for normal unplug/replug or page reload.

The button shows the rotating LED animation while waiting for the bridge, then pulses when the app sends `LED_PULSE`.

### Troubleshooting

- Bridge health: `curl http://127.0.0.1:8765/health`
- Logs: `/var/log/council-button-bridge.log`
- Restart bridge: `sudo launchctl kickstart -k system/com.council.button-bridge`

## Dev fallback

When no serial device is connected, **Space** acts as push-to-talk in the browser.
