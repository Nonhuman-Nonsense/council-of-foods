/*
 * Council of Foods — installation button firmware
 *
 * Hardware: Arduino Nano R4, with an Adafruit LED Arcade Button 1x4 STEMMA QT
 * (seesaw, PID 5296) on its Qwiic connector. Buttons 1-3 of the board are used.
 * Guide: https://learn.adafruit.com/adafruit-led-arcade-button-qt/arduino
 *
 * Serial protocol (115200 baud, newline-terminated):
 *   Device → host: BUTTON_DOWN, BUTTON_UP
 *   On host serial connect: one BUTTON_DOWN or BUTTON_UP to sync physical state
 *   Host → device: LED_OFF, LED_PULSE, LED_ON, LED_ERROR, HELLO_COUNCIL
 *
 * LED modes (from host — visual only; host decides what to do with presses):
 *   LED_OFF   — LEDs off
 *   LED_PULSE — breathing LEDs
 *   LED_ON    — LEDs fully on
 *   LED_ERROR — slow marching LEDs (bridge is up but has no client attached)
 *
 * While a host is connected, BUTTON_DOWN / BUTTON_UP are always sent on press/release.
 * The browser gates whether those events activate mic / agent logic.
 *
 * When no host has opened the USB serial port, button presses are ignored and
 * the LEDs cycle one-at-a-time (fast) as a connecting indicator. LED_ERROR reuses
 * the same marching pattern but slower, so the two are visually distinguishable.
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

// The Nano's own LEDs, visible in the installation:
// - the RGB LED's red (active low) mirrors button 1's LED (one LED can't show
//   the march across all three);
// - the orange LED_BUILTIN is on while a button is held, and blinks fast when
//   the button board can't be used.
#define MIRROR_BUTTON 0
#define HALT_BLINK_MS 125

#define LED_BRIGHTNESS 255
#define DEBOUNCE_MS 50
#define CONNECTING_ANIM_STEP_MS 1000
#define ERROR_ANIM_STEP_MS 3000
#define PULSE_CYCLE_MS 2400
#define PULSE_MIN_BRIGHTNESS 18
#define SERIAL_LINE_MAX 32

#define LED_MODE_OFF 0
#define LED_MODE_PULSE 1
#define LED_MODE_ON 2
#define LED_MODE_ERROR 3

// The Nano R4's Qwiic / STEMMA QT connector is on the second I2C bus (Wire1);
// Wire is the A4/A5 header pins.
Adafruit_seesaw ss(&Wire1);

bool mergedPressed = false;
bool lastStableMergedPressed = false;
unsigned long lastDebounceTime = 0;

bool hostConnected = false;
uint8_t hostLedMode = LED_MODE_OFF;
unsigned long pulseAnimStartMs = 0;

uint8_t marchAnimIndex = 0;
unsigned long marchAnimLastStep = 0;

char serialLineBuffer[SERIAL_LINE_MAX + 1];
uint8_t serialLineLength = 0;

void sendLine(const __FlashStringHelper *line) {
  Serial.println(line);
}

void setButtonLed(uint8_t index, uint8_t level) {
  ss.analogWrite(PWM_PINS[index], level);
  if (index == MIRROR_BUTTON) {
    analogWrite(LEDR, 255 - level);
  }
}

void applyAllLeds(uint8_t level) {
  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    setButtonLed(i, level);
  }
}

void showPressed(bool pressed) {
  digitalWrite(LED_BUILTIN, pressed ? HIGH : LOW);
}

bool readAnyButtonPressed() {
  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    if (!ss.digitalRead(SWITCH_PINS[i])) {
      return true;
    }
  }
  return false;
}

void syncButtonBaseline() {
  bool reading = readAnyButtonPressed();
  mergedPressed = reading;
  lastStableMergedPressed = reading;
  lastDebounceTime = millis();
  showPressed(reading);
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
  } else if (mode == LED_MODE_ERROR) {
    applyAllLeds(0);
    marchAnimIndex = 0;
    marchAnimLastStep = 0;
  }

  syncButtonBaseline();
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

void runMarchAnimation(unsigned long stepMs) {
  unsigned long now = millis();
  if (marchAnimLastStep == 0 || (now - marchAnimLastStep) >= stepMs) {
    applyAllLeds(0);
    if (marchAnimIndex < BUTTON_COUNT) {
      setButtonLed(marchAnimIndex, LED_BRIGHTNESS);
    }
    marchAnimIndex = (marchAnimIndex + 1) % BUTTON_COUNT;
    marchAnimLastStep = now;
  }
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
    case LED_MODE_ERROR:
      runMarchAnimation(ERROR_ANIM_STEP_MS);
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
    if (lastStableMergedPressed) {
      sendLine(F("BUTTON_DOWN"));
    } else {
      sendLine(F("BUTTON_UP"));
    }
  } else {
    hostLedMode = LED_MODE_OFF;
    marchAnimIndex = 0;
    marchAnimLastStep = 0;
    syncButtonBaseline();
  }
}

void runConnectingAnimation() {
  if (hostConnected) {
    return;
  }

  runMarchAnimation(CONNECTING_ANIM_STEP_MS);
}

void processSerialLine(const char *line) {
  if (strcmp(line, "LED_OFF") == 0) {
    setHostLedMode(LED_MODE_OFF);
  } else if (strcmp(line, "LED_PULSE") == 0) {
    setHostLedMode(LED_MODE_PULSE);
  } else if (strcmp(line, "LED_ON") == 0) {
    setHostLedMode(LED_MODE_ON);
  } else if (strcmp(line, "LED_ERROR") == 0) {
    setHostLedMode(LED_MODE_ERROR);
  } else if (strcmp(line, "HELLO_COUNCIL") == 0) {
    sendLine(F("READY council-button"));
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

// Native USB: nothing is listening at boot, so keep repeating the error.
void haltWithError(const __FlashStringHelper *message) {
  while (1) {
    sendLine(message);
    for (uint8_t i = 0; i < 4; i++) {
      digitalWrite(LED_BUILTIN, HIGH);
      delay(HALT_BLINK_MS);
      digitalWrite(LED_BUILTIN, LOW);
      delay(HALT_BLINK_MS);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  const uint8_t rgbPins[] = { LEDR, LEDG, LEDB };
  for (uint8_t pin : rgbPins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, HIGH);
  }

  if (!ss.begin(DEFAULT_I2C_ADDR)) {
    haltWithError(F("ERROR seesaw not found"));
  }

  uint16_t pid;
  uint8_t year, mon, day;
  ss.getProdDatecode(&pid, &year, &mon, &day);

  if (pid != 5296) {
    haltWithError(F("ERROR wrong seesaw PID"));
  }

  for (uint8_t i = 0; i < BUTTON_COUNT; i++) {
    ss.pinMode(SWITCH_PINS[i], INPUT_PULLUP);
  }
  applyAllLeds(0);

  hostConnected = (bool)Serial;
  hostLedMode = LED_MODE_OFF;
  marchAnimIndex = 0;
  marchAnimLastStep = 0;
  pulseAnimStartMs = millis();
  serialLineLength = 0;
  serialLineBuffer[0] = '\0';
  syncButtonBaseline();

  Serial.println(F("READY council-button"));
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
      showPressed(lastStableMergedPressed);
      if (hostConnected) {
        if (lastStableMergedPressed) {
          sendLine(F("BUTTON_DOWN"));
        } else {
          sendLine(F("BUTTON_UP"));
        }
      }
    }
  }

  delay(5);
}
