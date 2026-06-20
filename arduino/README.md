# Council of Foods — push-to-talk button

Firmware for the museum talk buttons using the [Adafruit LED Arcade Button QT](https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino) seesaw family.

## Hardware

- Arduino board with **native USB serial** (recommended: SAMD boards such as Adafruit Metro M0 Express or Feather M0)
- **One** I2C seesaw board (STEMMA QT), supporting up to four buttons on the same chip
- This sketch merges **three buttons** into one push-to-talk signal for the browser

### Board choice

Prefer **SAMD (M0) boards** for museum installs. They handle USB reconnect cleanly when Chrome opens and closes the serial port.

Some **32u4 / Leonardo-style** boards reset when the host opens serial (DTR toggle). That still works, but you may see an extra boot (`READY council-ptt`) on each reconnect. If reconnect feels flaky on those boards, switch to a SAMD board or adjust the auto-reset circuit.

Use a **powered USB hub or a direct rear-panel port** on the museum PC. Avoid USB selective suspend in the OS power settings.

## LED modes

The browser drives three host modes over serial:

| Command | LED behaviour | Button |
|---|---|---|
| `LED_OFF` | Off | Presses reported (`PTT_DOWN` / `PTT_UP`); host decides whether to act |
| `LED_PULSE` | Smooth breathing animation | Presses reported |
| `LED_ON` | Fully on | Presses reported |

### No host connected

When Chrome has **not** opened the USB serial port:

- Button presses are **ignored** (no `PTT_DOWN` / `PTT_UP` is sent)
- LEDs cycle one-at-a-time (1 s each) as a **connecting** indicator
- The animation starts automatically whenever the USB link is lost

After the browser connects, it sends `LED_PULSE` (ready) or `LED_ON` (mic active). Until then the device stays in `LED_OFF`.

## Upload

1. Install the **Adafruit seesaw** library in Arduino IDE
2. Open `council_ptt/council_ptt.ino`
3. Select your board and port, then upload
4. Optional: open Serial Monitor at **115200 baud**, send `LED_PULSE`, then press a button to verify `PTT_DOWN` / `PTT_UP`

Close Serial Monitor before connecting from Chrome — only one program can use the port at a time.

## Serial protocol

| Direction | Message |
|---|---|
| Device → host | `PTT_DOWN` (any button pressed, whenever host serial is connected) |
| Device → host | `PTT_UP` (all buttons released) |
| Device → host | `PONG` (response to `PING`) |
| Device → host | `READY council-ptt` (on boot) |
| Host → device | `LED_OFF` |
| Host → device | `LED_PULSE` |
| Host → device | `LED_ON` |
| Host → device | `PING` |

All messages are newline-terminated ASCII. Incoming host lines longer than 32 characters are discarded.

## Museum setup

### First install (once per Mac)

1. Upload this sketch
2. Install the **ptt-bridge** daemon on the museum Mac (`ptt-bridge/install/macos/install.sh`)
3. Open the app, go to `/#setup`
4. Enable **Push to Talk**

The bridge owns the USB port. Chrome connects to `ws://127.0.0.1:8765` — no browser USB permission dialog.

### Day-to-day operation

With the bridge running, the web app **auto-connects in the background** whenever:

- Push to Talk is enabled in `localStorage`, and
- The page is open, and
- The button is plugged in

You do **not** need to visit `/#setup` or press Connect again for normal unplug/replug or page reload.

The button shows the rotating LED animation while waiting for the bridge, then pulses when the app sends `LED_PULSE`.

### Staff disconnect

**Disconnect** on the setup page pauses auto-reconnect until Connect is pressed again.

### Troubleshooting

- Bridge health: `curl http://127.0.0.1:8765/health`
- Logs: `/var/log/council-ptt-bridge.log`
- Restart bridge: `sudo launchctl kickstart -k system/com.council.ptt-bridge`

## Dev fallback

When no serial device is connected, **Space** acts as push-to-talk in the browser.
