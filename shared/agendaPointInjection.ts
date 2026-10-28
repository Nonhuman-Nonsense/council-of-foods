import { agendaPointCountFromAgendaPoints } from "./topicPrompt.js";

export const RANDOM_AGENDA_POINT_PLACEHOLDER = "[RANDOM_AGENDA_POINT]";

export const SINGLE_AGENDA_POINT_PLACEHOLDER = "[SINGLE_AGENDA_POINT]";

export const RANDOM_AGENDA_POINT_FALLBACK =
  "Choose ONE point from todays agenda in RANDOM order, just because it is at the top of the list doesn't mean it always comes first.";

export function pickAgendaPoint(count: number): number {
  if (count < 1) return 1;
  return Math.floor(Math.random() * count) + 1;
}

/**
 * Replaces `[RANDOM_AGENDA_POINT]` in the chair prompt when present.
 * If the placeholder is absent, returns the prompt unchanged.
 * `pinnedPoint` (1-based) replaces the random pick when it names a point on the agenda.
 */
export function injectRandomAgendaPoint(
  chairPrompt: string,
  agendaPoints?: string[],
  pinnedPoint?: number,
): string {
  if (!chairPrompt.includes(RANDOM_AGENDA_POINT_PLACEHOLDER)) {
    return chairPrompt;
  }

  const agendaPointCount = agendaPointCountFromAgendaPoints(agendaPoints);
  const replacement =
    agendaPointCount != null
      ? String(
          pinnedPoint != null && pinnedPoint >= 1 && pinnedPoint <= agendaPointCount
            ? pinnedPoint
            : pickAgendaPoint(agendaPointCount),
        )
      : RANDOM_AGENDA_POINT_FALLBACK;

  return chairPrompt.replaceAll(RANDOM_AGENDA_POINT_PLACEHOLDER, replacement);
}

/**
 * Replaces `[SINGLE_AGENDA_POINT]` in the chair prompt with `rule` when the agenda has exactly
 * one point (a visitor's own question), so the chair stays on it; with several points the
 * placeholder is removed and the chair moves through the agenda as usual.
 */
export function injectSingleAgendaPointRule(
  chairPrompt: string,
  agendaPoints?: string[],
  rule = "",
): string {
  const single = agendaPointCountFromAgendaPoints(agendaPoints) === 1;
  return chairPrompt.replaceAll(SINGLE_AGENDA_POINT_PLACEHOLDER, single ? rule : "");
}
