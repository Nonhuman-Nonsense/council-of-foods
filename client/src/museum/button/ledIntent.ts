import type { ButtonLedMode } from "./ledMode";

export type ButtonLedOwner = "setup" | "voice-guide" | "human-input";

const LED_OWNER_PRIORITY: Record<ButtonLedOwner, number> = {
  "human-input": 3,
  "voice-guide": 2,
  setup: 1,
};

export function mergeLedIntents(
  intents: Partial<Record<ButtonLedOwner, ButtonLedMode>>,
): ButtonLedMode {
  let winner: ButtonLedOwner | null = null;
  let winnerPriority = -1;

  for (const owner of Object.keys(intents) as ButtonLedOwner[]) {
    const mode = intents[owner];
    if (mode === undefined) {
      continue;
    }
    const priority = LED_OWNER_PRIORITY[owner];
    if (priority > winnerPriority) {
      winner = owner;
      winnerPriority = priority;
    }
  }

  return winner ? intents[winner]! : "off";
}
