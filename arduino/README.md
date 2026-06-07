# Council of Foods — push-to-talk button

Firmware for the museum talk buttons using the [Adafruit LED Arcade Button QT](https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino).

## Hardware

- Arduino board with native USB serial (Metro, Feather, etc.)
- One or more Adafruit LED Arcade Button QT boards on STEMMA QT / I2C (same seesaw address)
- The sketch merges **three buttons** into one push-to-talk signal for the browser
- `LED_ON` / `LED_OFF` from the browser lights **all** button LEDs together

## Upload

1. Install **Adafruit seesaw** library in Arduino IDE
2. Open `council_ptt/council_ptt.ino`
3. Select your board and port, upload
4. Open Serial Monitor at **115200 baud** to verify `PTT_DOWN` / `PTT_UP` when pressing any button

Close Serial Monitor before connecting from Chrome — only one program can use the port at a time.

## Serial protocol

| Direction | Message |
|---|---|
| Device → host | `PTT_DOWN` (any button pressed) |
| Device → host | `PTT_UP` (all buttons released) |
| Device → host | `PONG` |
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
