export const TOPIC_PLACEHOLDER = "[TOPIC]";
export const AGENDA_POINTS_PLACEHOLDER = "[AGENDA_POINTS]";
export const AGENDA_SECTION_HEADER = "Today's Agenda Points:";
export const AGENDA_SECTION_HEADER_SV = "Dagens agendapunkter:";
export const VISITOR_INPUT_PLACEHOLDER = "[VISITOR_INPUT]";
export const CURRENT_DATE_PLACEHOLDER = "[CURRENT_DATE]";

export function getAgendaSectionHeader(language = "en"): string {
  return language === "sv" ? AGENDA_SECTION_HEADER_SV : AGENDA_SECTION_HEADER;
}

/**
 * Formats the meeting date for `[CURRENT_DATE]`. The conversation model's training data ends
 * years before any given meeting, so the date is injected rather than written into the prompts,
 * which would otherwise need updating as time passes.
 */
export function formatMeetingDate(now: Date, language = "en"): string {
  return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en-GB", {
    dateStyle: "long",
  }).format(now);
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
 * `now` is injected at `[CURRENT_DATE]`; it is a parameter so tests can pin the clock.
 */
export function buildMeetingSystemPrompt(
  system: string,
  topicPrompt: string,
  agendaPoints?: string[],
  language = "en",
  now: Date = new Date(),
): string {
  const agendaText = buildAgendaPointsText(agendaPoints, language);
  let result = system
    .replace(TOPIC_PLACEHOLDER, topicPrompt.trim())
    .replace(CURRENT_DATE_PLACEHOLDER, formatMeetingDate(now, language));

  if (agendaText) {
    result = result.replace(AGENDA_POINTS_PLACEHOLDER, agendaText);
  } else {
    result = removeAgendaPointsPlaceholder(result);
  }

  return result;
}
