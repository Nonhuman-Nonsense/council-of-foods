import type { Message } from "@shared/ModelTypes";
import type { CouncilState } from "@council/hooks/useCouncilMachine";

export type ParticipationPhase = "off" | "warm" | "active";

/**
 * Derives whether the human participation UI should be off, warming (pre-connecting
 * while the previous speaker is playing), or actively open for input.
 *
 * "warm" fires when the message immediately after what is currently playing is an
 * awaiting_human_* marker — covering both the first-time invitation case (invitation
 * at N, awaiting at N+1) and direct mic turns (any speaker at N, awaiting at N+1).
 */
export function getParticipationPhase(
  councilState: CouncilState,
  textMessages: Message[],
  playingNowIndex: number,
): ParticipationPhase {
  if (councilState === "human_input" || councilState === "human_panelist") {
    return "active";
  }

  const upcoming = textMessages[playingNowIndex + 1];
  if (
    upcoming?.type === "awaiting_human_question" ||
    upcoming?.type === "awaiting_human_panelist"
  ) {
    return "warm";
  }

  return "off";
}
