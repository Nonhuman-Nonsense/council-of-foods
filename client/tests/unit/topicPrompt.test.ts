// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  AGENDA_POINTS_PLACEHOLDER,
  AGENDA_SECTION_HEADER,
  TOPIC_PLACEHOLDER,
  agendaPointCountFromAgendaPoints,
  buildAgendaPointsText,
  buildMeetingSystemPrompt,
  nonEmptyAgendaPoints,
} from "@shared/topicPrompt";

describe("topicPrompt", () => {
  const systemTemplate = `Welcome.\n\nToday's meeting is about:\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}\n\nEach participant speaks.`;

  it("builds agenda text with numbered items", () => {
    expect(buildAgendaPointsText(["First item", "Second item"])).toBe(
      `\n${AGENDA_SECTION_HEADER}\n\n1. First item\n\n2. Second item`,
    );
    expect(buildAgendaPointsText([])).toBe("");
  });

  it("removes [AGENDA_POINTS] from the system prompt when there are no agenda points", () => {
    const result = buildMeetingSystemPrompt(systemTemplate, "Topic body.", []);
    expect(result).toContain("Topic body.");
    expect(result).not.toContain(AGENDA_POINTS_PLACEHOLDER);
    expect(result).toBe(
      "Welcome.\n\nToday's meeting is about:\n\nTopic body.\n\nEach participant speaks.",
    );
  });

  it("inserts numbered agenda points at [AGENDA_POINTS]", () => {
    const result = buildMeetingSystemPrompt(systemTemplate, "Topic body.", ["One", "Two"]);
    expect(result).toContain("Topic body.\n\nToday's Agenda Points:");
    expect(result).toContain("1. One");
    expect(result).toContain("2. Two");
    expect(result).not.toContain(AGENDA_POINTS_PLACEHOLDER);
  });

  it("derives agenda point count from non-empty items only", () => {
    expect(agendaPointCountFromAgendaPoints(["One", "", "Two"])).toBe(2);
    expect(agendaPointCountFromAgendaPoints([])).toBeUndefined();
    expect(nonEmptyAgendaPoints([" One ", ""])).toEqual(["One"]);
  });
});
