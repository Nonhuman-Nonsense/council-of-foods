# Council of Foods — push-to-talk button

Firmware for the museum talk buttons using the [Adafruit LED Arcade Button QT](https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino) seesaw family.

## Hardware

- Arduino board with native USB serial (Metro, Feather, etc.)
- **One** I2C seesaw board (STEMMA QT), supporting up to four buttons on the same chip
- This sketch merges **three buttons** into one push-to-talk signal for the browser
- `LED_ON` / `LED_OFF` from the browser lights **all** button LEDs together

## LED behaviour

| State | LED pattern |
|---|---|
| No host connected | Buttons cycle one-at-a-time (1 s each) — “connecting” indicator |
| Host connected | Browser controls all LEDs via `LED_ON` / `LED_OFF` |

Buttons are read and debounced even when no browser is connected. The connecting animation starts automatically whenever the USB serial link is lost.

## Upload

1. Install **Adafruit seesaw** library in Arduino IDE
2. Open `council_ptt/council_ptt.ino`
3. Select your board and port, upload
4. Optional: open Serial Monitor at **115200 baud** to verify `PTT_DOWN` / `PTT_UP` when pressing any button

Close Serial Monitor before connecting from Chrome — only one program can use the port at a time.

## Serial protocol

| Direction | Message |
|---|---|
| Device → host | `PTT_DOWN` (any button pressed) |
| Device → host | `PTT_UP` (all buttons released) |
| Device → host | `PONG` |
| Device → host | `READY council-ptt` (on boot) |
| Host → device | `LED_ON` (all button LEDs on) |
| Host → device | `LED_OFF` (all button LEDs off) |
| Host → device | `PING` |

All messages are newline-terminated ASCII.

## Museum setup

1. Upload this sketch
2. Open the app at `/#setup`
3. Enable **Push to Talk**
4. Click **Connect talk button** and grant the USB device
5. Reload the page — Chrome should auto-reconnect via a previously granted port

## Dev fallback

When no serial device is connected, **Space** acts as push-to-talk in the browser.
