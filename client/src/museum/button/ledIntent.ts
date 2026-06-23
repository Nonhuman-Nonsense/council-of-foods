import type { ButtonLedMode } from "./ledMode";

export type ButtonLedOwner = "setup" | "voice-guide" | "human-input" | "meta-agent";

/** Setup is highest: staff diagnostics overlay mounted on top of the running app. */
const LED_OWNER_PRIORITY: Record<ButtonLedOwner, number> = {
  setup: 3,
  "human-input": 2,
  "voice-guide": 1,
  "meta-agent": 1,
};

/**
 * Highest-priority owner with a non-off LED mode wins button intent.
 * Off means the owner is not competing (equivalent to unregistered).
 */
export function mergeButtonIntentOwner(
  intents: Partial<Record<ButtonLedOwner, ButtonLedMode>>,
): ButtonLedOwner | null {
  let winner: ButtonLedOwner | null = null;
  let winnerPriority = -1;

  for (const owner of Object.keys(intents) as ButtonLedOwner[]) {
    const mode = intents[owner];
    if (mode === undefined || mode === "off") {
      continue;
    }
    const priority = LED_OWNER_PRIORITY[owner];
    if (priority > winnerPriority) {
      winner = owner;
      winnerPriority = priority;
    }
  }

  return winner;
}

/** Winning LED mode from competing intents. */
export function mergeLedIntents(
  intents: Partial<Record<ButtonLedOwner, ButtonLedMode>>,
): ButtonLedMode {
  const winner = mergeButtonIntentOwner(intents);
  return winner ? intents[winner]! : "off";
}

/** Press routing follows the same winning owner as LED (pulse/on only compete). */
export function mergePressOwner(
  intents: Partial<Record<ButtonLedOwner, ButtonLedMode>>,
): ButtonLedOwner | null {
  return mergeButtonIntentOwner(intents);
}
