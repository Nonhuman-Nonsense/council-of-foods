export const TOPIC_PLACEHOLDER = "[TOPIC]";
export const AGENDA_POINTS_PLACEHOLDER = "[AGENDA_POINTS]";
export const AGENDA_SECTION_HEADER = "Today's Agenda Points:";

export function nonEmptyAgendaPoints(agendaPoints?: string[]): string[] {
  return (agendaPoints ?? []).map((point) => point.trim()).filter((point) => point.length > 0);
}

export function agendaPointCountFromAgendaPoints(agendaPoints?: string[]): number | undefined {
  const count = nonEmptyAgendaPoints(agendaPoints).length;
  return count > 0 ? count : undefined;
}

export function buildAgendaPointsText(agendaPoints?: string[]): string {
  const points = nonEmptyAgendaPoints(agendaPoints);
  if (points.length === 0) {
    return "";
  }

  const numbered = points.map((point, index) => `${index + 1}. ${point}`).join("\n\n");
  return `${AGENDA_SECTION_HEADER}\n\n${numbered}`;
}

function removeAgendaPointsPlaceholder(system: string): string {
  return system
    .replace(/\r\n/g, "\n")
    .replace(/\n?\[AGENDA_POINTS\]\n?/g, "\n")
    .replace(/\[AGENDA_POINTS\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Builds the meeting system prompt from the shared system template, topic body, and optional agenda points.
 */
export function buildMeetingSystemPrompt(
  system: string,
  topicPrompt: string,
  agendaPoints?: string[],
): string {
  const agendaText = buildAgendaPointsText(agendaPoints);
  let result = system.replace(TOPIC_PLACEHOLDER, topicPrompt.trim());

  if (agendaText) {
    result = result.replace(AGENDA_POINTS_PLACEHOLDER, agendaText);
  } else {
    result = removeAgendaPointsPlaceholder(result);
  }

  return result;
}
