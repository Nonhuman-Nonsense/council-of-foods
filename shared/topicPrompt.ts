export const TOPIC_PLACEHOLDER = "[TOPIC]";
export const AGENDA_POINTS_PLACEHOLDER = "[AGENDA_POINTS]";
export const AGENDA_SECTION_HEADER = "Today's Agenda Points:";
export const AGENDA_SECTION_HEADER_SV = "Dagens agendapunkter:";
export const VISITOR_INPUT_PLACEHOLDER = "[VISITOR_INPUT]";

export function getAgendaSectionHeader(language = "en"): string {
  return language === "sv" ? AGENDA_SECTION_HEADER_SV : AGENDA_SECTION_HEADER;
}

export function nonEmptyAgendaPoints(agendaPoints?: string[]): string[] {
  return (agendaPoints ?? []).map((point) => point.trim()).filter((point) => point.length > 0);
}

export function agendaPointCountFromAgendaPoints(agendaPoints?: string[]): number | undefined {
  const count = nonEmptyAgendaPoints(agendaPoints).length;
  return count > 0 ? count : undefined;
}

export function buildAgendaPointsText(agendaPoints?: string[], language = "en"): string {
  const points = nonEmptyAgendaPoints(agendaPoints);
  if (points.length === 0) {
    return "";
  }

  const header = getAgendaSectionHeader(language);
  const numbered = points.map((point, index) => `${index + 1}. ${point}`).join("\n\n");
  return `\n${header}\n\n${numbered}`;
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
  language = "en",
): string {
  const agendaText = buildAgendaPointsText(agendaPoints, language);
  let result = system.replace(TOPIC_PLACEHOLDER, topicPrompt.trim());

  if (agendaText) {
    result = result.replace(AGENDA_POINTS_PLACEHOLDER, agendaText);
  } else {
    result = removeAgendaPointsPlaceholder(result);
  }

  return result;
}
