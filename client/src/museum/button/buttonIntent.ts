import type { ButtonLedMode } from "./ledMode";

export type ButtonOwner = "setup" | "voice-guide" | "human-input" | "meta-agent";

export type ButtonClaims = Partial<Record<ButtonOwner, true>>;
export type ButtonLedModes = Partial<Record<ButtonOwner, ButtonLedMode>>;

/** Setup is highest: staff diagnostics overlay mounted on top of the running app. */
const BUTTON_OWNER_PRIORITY: Record<ButtonOwner, number> = {
  setup: 3,
  "human-input": 2,
  "voice-guide": 1,
  "meta-agent": 1,
};

/** Highest-priority owner with an active claim wins button routing. */
export function mergeButtonOwner(claims: ButtonClaims): ButtonOwner | null {
  let winner: ButtonOwner | null = null;
  let winnerPriority = -1;

  for (const owner of Object.keys(claims) as ButtonOwner[]) {
    if (!claims[owner]) {
      continue;
    }
    const priority = BUTTON_OWNER_PRIORITY[owner];
    if (priority > winnerPriority) {
      winner = owner;
      winnerPriority = priority;
    }
  }

  return winner;
}

/** Hardware LED follows the current buttonOwner's LED preference. */
export function resolveAppliedLedMode(
  ledModes: ButtonLedModes,
  buttonOwner: ButtonOwner | null,
): ButtonLedMode {
  return buttonOwner ? (ledModes[buttonOwner] ?? "off") : "off";
}
