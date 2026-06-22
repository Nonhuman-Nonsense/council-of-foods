import type { ButtonLedMode } from "./ledMode";

export type ButtonLedOwner = "setup" | "voice-guide" | "human-input" | "meta-agent";

/** Setup is highest: staff diagnostics overlay mounted on top of the running app. */
const LED_OWNER_PRIORITY: Record<ButtonLedOwner, number> = {
  setup: 3,
  "human-input": 2,
  "voice-guide": 1,
  "meta-agent": 1,
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
