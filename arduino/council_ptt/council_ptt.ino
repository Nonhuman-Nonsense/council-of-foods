/*
 * Council of Foods — push-to-talk button firmware
 *
 * Hardware: one Adafruit seesaw board (e.g. LED Arcade Button QT family) on
 * STEMMA QT / I2C, with up to four buttons on the same chip.
 * Guide: https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino
 *
 * Serial protocol (115200 baud, newline-terminated):
 *   Device → host: PTT_DOWN, PTT_UP, PONG
 *   Host → device: LED_OFF, LED_PULSE, LED_ON, PING
 *
 * LED modes (from host — visual only; host decides what to do with presses):
 *   LED_OFF   — LEDs off
 *   LED_PULSE — breathing LEDs
 *   LED_ON    — LEDs fully on
 *
 * While a host is connected, PTT_DOWN / PTT_UP are always sent on press/release.
 * The browser gates whether those events activate mic / agent logic.
 *
 * When no host has opened the USB serial port, button presses are ignored and
 * the LEDs cycle one-at-a-time as a connecting indicator.
 */

#include <math.h>
#include <string.h>
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
#define DEBOUNCE_MS 50
#define CONNECTING_ANIM_STEP_MS 1000
#define PULSE_CYCLE_MS 2400
#define PULSE_MIN_BRIGHTNESS 18
#define SERIAL_LINE_MAX 32

#define LED_MODE_OFF 0
#define LED_MODE_PULSE 1
#define LED_MODE_ON 2

Adafruit_seesaw ss;

bool mergedPressed = false;
bool lastStableMergedPressed = false;
unsigned long lastDebounceTime = 0;

bool hostConnected = false;
uint8_t hostLedMode = LED_MODE_OFF;
unsigned long pulseAnimStartMs = 0;

uint8_t connectingAnimIndex = 0;
unsigned long connectingAnimLastStep = 0;

char serialLineBuffer[SERIAL_LINE_MAX + 1];
uint8_t serialLineLength = 0;

void sendLine(const __FlashStringHelper *line) {
  Serial.println(line);
}

void applyAllLeds(uint8_t level) {
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

void syncPttBaseline() {
  bool reading = readAnyButtonPressed();
  mergedPressed = reading;
  lastStableMergedPressed = reading;
  lastDebounceTime = millis();
}

float pulseEase(float t) {
  return t * t * (3.0f - 2.0f * t);
}

void setHostLedMode(uint8_t mode) {
  hostLedMode = mode;

  if (mode == LED_MODE_PULSE) {
    pulseAnimStartMs = millis();
  }

  if (mode == LED_MODE_OFF) {
    applyAllLeds(0);
  } else if (mode == LED_MODE_ON) {
    applyAllLeds(LED_BRIGHTNESS);
  }

  syncPttBaseline();
}

void runPulseAnimation() {
  unsigned long elapsed = millis() - pulseAnimStartMs;
  float phase = fmod((float)elapsed / (float)PULSE_CYCLE_MS, 1.0f);
  float triangle = phase < 0.5f ? phase * 2.0f : (1.0f - phase) * 2.0f;
  float eased = pulseEase(triangle);
  uint8_t level =
    PULSE_MIN_BRIGHTNESS +
    (uint8_t)(eased * (float)(LED_BRIGHTNESS - PULSE_MIN_BRIGHTNESS));
  applyAllLeds(level);
}

void updateHostLedOutput() {
  if (!hostConnected) {
    return;
  }

  switch (hostLedMode) {
    case LED_MODE_OFF:
      applyAllLeds(0);
      break;
    case LED_MODE_PULSE:
      runPulseAnimation();
      break;
    case LED_MODE_ON:
      applyAllLeds(LED_BRIGHTNESS);
      break;
  }
}

void updateHostConnection() {
  bool nowConnected = (bool)Serial;
  if (nowConnected == hostConnected) {
    return;
  }

  hostConnected = nowConnected;
  serialLineLength = 0;
  serialLineBuffer[0] = '\0';
  applyAllLeds(0);

  if (hostConnected) {
    setHostLedMode(LED_MODE_OFF);
  } else {
    hostLedMode = LED_MODE_OFF;
    connectingAnimIndex = 0;
    connectingAnimLastStep = 0;
    syncPttBaseline();
  }
}

void runConnectingAnimation() {
  if (hostConnected) {
    return;
  }

  unsigned long now = millis();
  if (connectingAnimLastStep == 0 || (now - connectingAnimLastStep) >= CONNECTING_ANIM_STEP_MS) {
    applyAllLeds(0);
    if (connectingAnimIndex < BUTTON_COUNT) {
      ss.analogWrite(PWM_PINS[connectingAnimIndex], LED_BRIGHTNESS);
    }
    connectingAnimIndex = (connectingAnimIndex + 1) % BUTTON_COUNT;
    connectingAnimLastStep = now;
  }
}

void processSerialLine(const char *line) {
  if (strcmp(line, "LED_OFF") == 0) {
    setHostLedMode(LED_MODE_OFF);
  } else if (strcmp(line, "LED_PULSE") == 0) {
    setHostLedMode(LED_MODE_PULSE);
  } else if (strcmp(line, "LED_ON") == 0) {
    setHostLedMode(LED_MODE_ON);
  } else if (strcmp(line, "PING") == 0) {
    sendLine(F("PONG"));
  }
}

void handleSerialInput() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\r') {
      continue;
    }

    if (c == '\n') {
      if (serialLineLength > 0) {
        serialLineBuffer[serialLineLength] = '\0';
        processSerialLine(serialLineBuffer);
      }
      serialLineLength = 0;
      continue;
    }

    if (serialLineLength < SERIAL_LINE_MAX) {
      serialLineBuffer[serialLineLength++] = c;
    }
  }
}

void setup() {
  Serial.begin(115200);

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
  applyAllLeds(0);

  hostConnected = (bool)Serial;
  hostLedMode = LED_MODE_OFF;
  connectingAnimIndex = 0;
  connectingAnimLastStep = 0;
  pulseAnimStartMs = millis();
  serialLineLength = 0;
  serialLineBuffer[0] = '\0';
  syncPttBaseline();

  Serial.println(F("READY council-ptt"));
}

void loop() {
  updateHostConnection();

  if (hostConnected) {
    handleSerialInput();
    updateHostLedOutput();
  } else {
    runConnectingAnimation();
  }

  bool reading = readAnyButtonPressed();
  if (reading != mergedPressed) {
    lastDebounceTime = millis();
    mergedPressed = reading;
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_MS) {
    if (reading != lastStableMergedPressed) {
      lastStableMergedPressed = reading;
      if (hostConnected) {
        if (lastStableMergedPressed) {
          sendLine(F("PTT_DOWN"));
        } else {
          sendLine(F("PTT_UP"));
        }
      }
    }
  }

  delay(5);
}
