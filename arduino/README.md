# Council of Foods — push-to-talk button

Firmware for the museum talk buttons using the [Adafruit LED Arcade Button QT](https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino) seesaw family.

## Hardware

- Arduino board with native USB serial (Metro, Feather, etc.)
- **One** I2C seesaw board (STEMMA QT), supporting up to four buttons on the same chip
- This sketch merges **three buttons** into one push-to-talk signal for the browser

## LED modes

The browser drives three host modes over serial:

| Command | LED behaviour | Button |
|---|---|---|
| `LED_OFF` | Off | Presses ignored |
| `LED_PULSE` | Smooth breathing animation | Press to activate PTT |
| `LED_ON` | Fully on | Mic active |

When no host has opened the USB serial port, the buttons still work locally and the LEDs cycle one-at-a-time (1 s each) as a **connecting** indicator. That animation starts automatically whenever the USB link is lost.

## Upload

1. Install **Adafruit seesaw** library in Arduino IDE
2. Open `council_ptt/council_ptt.ino`
3. Select your board and port, upload
4. Optional: open Serial Monitor at **115200 baud** to verify `PTT_DOWN` / `PTT_UP` when pressing any button (send `LED_PULSE` first)

Close Serial Monitor before connecting from Chrome — only one program can use the port at a time.

## Serial protocol

| Direction | Message |
|---|---|
| Device → host | `PTT_DOWN` (any button pressed, only in pulse/on modes) |
| Device → host | `PTT_UP` (all buttons released) |
| Device → host | `PONG` |
| Device → host | `READY council-ptt` (on boot) |
| Host → device | `LED_OFF` |
| Host → device | `LED_PULSE` |
| Host → device | `LED_ON` |
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
