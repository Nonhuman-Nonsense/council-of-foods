import { agendaPointCountFromAgendaPoints } from "./topicPrompt";

export const RANDOM_AGENDA_POINT_PLACEHOLDER = "[RANDOM_AGENDA_POINT]";

export const RANDOM_AGENDA_POINT_FALLBACK =
  "Choose ONE point from todays agenda in RANDOM order, just because it is at the top of the list doesn't mean it always comes first.";

export function pickAgendaPoint(count: number): number {
  if (count < 1) return 1;
  return Math.floor(Math.random() * count) + 1;
}

/**
 * Replaces `[RANDOM_AGENDA_POINT]` in the chair prompt when present.
 * If the placeholder is absent, returns the prompt unchanged.
 */
export function injectRandomAgendaPoint(chairPrompt: string, agendaPoints?: string[]): string {
  if (!chairPrompt.includes(RANDOM_AGENDA_POINT_PLACEHOLDER)) {
    return chairPrompt;
  }

  const agendaPointCount = agendaPointCountFromAgendaPoints(agendaPoints);
  const replacement =
    agendaPointCount != null
      ? String(pickAgendaPoint(agendaPointCount))
      : RANDOM_AGENDA_POINT_FALLBACK;

  return chairPrompt.replaceAll(RANDOM_AGENDA_POINT_PLACEHOLDER, replacement);
}
