/*
 * Council of Foods — push-to-talk button firmware
 *
 * Hardware: Adafruit LED Arcade Button QT (PID 5296) on STEMMA QT / I2C
 * Guide: https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino
 *
 * Serial protocol (115200 baud, newline-terminated):
 *   Device → host: PTT_DOWN, PTT_UP, PONG
 *   Host → device: LED_ON, LED_OFF, PING
 *
 * Multiple buttons are merged on the Arduino: any press sends PTT_DOWN,
 * all released sends PTT_UP. LED commands apply to every button LED.
 */

#include "Adafruit_seesaw.h"

#define DEFAULT_I2C_ADDR 0x3A

#define SWITCH1 18
#define SWITCH2 19
#define SWITCH3 20

#define PWM1 12
#define PWM2 13
#define PWM3 0

#define BUTTON_COUNT 3
const uint8_t SWITCH_PINS[BUTTON_COUNT] = { SWITCH1, SWITCH2, SWITCH3 };
const uint8_t PWM_PINS[BUTTON_COUNT] = { PWM1, PWM2, PWM3 };

#define LED_BRIGHTNESS 255
#define DEBOUNCE_MS 35

Adafruit_seesaw ss;

bool mergedPressed = false;
bool lastStableMergedPressed = false;
unsigned long lastDebounceTime = 0;

void sendLine(const __FlashStringHelper *line) {
  Serial.println(line);
}

void setAllLeds(bool on) {
  uint8_t level = on ? LED_BRIGHTNESS : 0;
  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    ss.analogWrite(PWM_PINS[i], level);
  }
}

bool readAnyButtonPressed() {
  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    if (!ss.digitalRead(SWITCH_PINS[i])) {
      return true;
    }
  }
  return false;
}

void handleSerialInput() {
  if (!Serial.available()) {
    return;
  }

  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line == F("LED_ON")) {
    setAllLeds(true);
  } else if (line == F("LED_OFF")) {
    setAllLeds(false);
  } else if (line == F("PING")) {
    sendLine(F("PONG"));
  }
}

void setup() {
  Serial.begin(115200);

  while (!Serial) {
    delay(10);
  }

  if (!ss.begin(DEFAULT_I2C_ADDR)) {
    Serial.println(F("ERROR seesaw not found"));
    while (1) {
      delay(10);
    }
  }

  uint16_t pid;
  uint8_t year, mon, day;
  ss.getProdDatecode(&pid, &year, &mon, &day);

  if (pid != 5296) {
    Serial.println(F("ERROR wrong seesaw PID"));
    while (1) {
      delay(10);
    }
  }

  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    ss.pinMode(SWITCH_PINS[i], INPUT_PULLUP);
  }
  setAllLeds(false);

  Serial.println(F("READY council-ptt"));
}

void loop() {
  handleSerialInput();

  bool reading = readAnyButtonPressed();
  if (reading != mergedPressed) {
    lastDebounceTime = millis();
    mergedPressed = reading;
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_MS) {
    if (reading != lastStableMergedPressed) {
      lastStableMergedPressed = reading;
      if (lastStableMergedPressed) {
        sendLine(F("PTT_DOWN"));
      } else {
        sendLine(F("PTT_UP"));
      }
    }
  }

  delay(5);
}
