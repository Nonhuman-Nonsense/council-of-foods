// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  AGENDA_POINTS_PLACEHOLDER,
  AGENDA_SECTION_HEADER,
  AGENDA_SECTION_HEADER_SV,
  CURRENT_DATE_PLACEHOLDER,
  TOPIC_PLACEHOLDER,
  agendaPointCountFromAgendaPoints,
  buildAgendaPointsText,
  buildMeetingSystemPrompt,
  nonEmptyAgendaPoints,
} from "@shared/topicPrompt";

describe("topicPrompt", () => {
  const systemTemplate = `Welcome.\n\nToday's meeting is about:\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}\n\nEach participant speaks.`;
  const swedishSystemTemplate = `Välkommen.\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}\n\nVarje deltagare talar.`;

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
    expect(result).toContain(`Topic body.\n\n${AGENDA_SECTION_HEADER}`);
    expect(result).toContain("1. One");
    expect(result).toContain("2. Two");
    expect(result).not.toContain(AGENDA_POINTS_PLACEHOLDER);
  });

  it("uses the Swedish agenda header when language is sv", () => {
    const result = buildMeetingSystemPrompt(swedishSystemTemplate, "Ämne.", ["Ett", "Två"], "sv");
    expect(result).toContain(AGENDA_SECTION_HEADER_SV);
    expect(result).toContain("1. Ett");
  });

  it("derives agenda point count from non-empty items only", () => {
    expect(agendaPointCountFromAgendaPoints(["One", "", "Two"])).toBe(2);
    expect(agendaPointCountFromAgendaPoints([])).toBeUndefined();
    expect(nonEmptyAgendaPoints([" One ", ""])).toEqual(["One"]);
  });
});

describe("topicPrompt: [CURRENT_DATE] injection", () => {
  const meetingDate = new Date("2026-10-10T12:00:00Z");
  const template = `Today is ${CURRENT_DATE_PLACEHOLDER}.\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}`;

  it.each([
    ["en", "Today is 10 October 2026."],
    ["sv", "Today is 10 oktober 2026."],
  ])("injects the meeting date localised for %s", (language, expected) => {
    const result = buildMeetingSystemPrompt(template, "Topic body.", [], language, meetingDate);
    expect(result).toContain(expected);
    expect(result).not.toContain(CURRENT_DATE_PLACEHOLDER);
  });

  it("leaves a template without the placeholder untouched", () => {
    const result = buildMeetingSystemPrompt(
      `Static intro.\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}`,
      "Topic body.",
      [],
      "en",
      meetingDate,
    );
    expect(result).toBe("Static intro.\n\nTopic body.");
  });
});
