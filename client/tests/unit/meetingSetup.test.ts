// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Character } from "@shared/ModelTypes";
import { RANDOM_AGENDA_POINT_PLACEHOLDER, RANDOM_AGENDA_POINT_FALLBACK } from "@shared/agendaPointInjection";
import { AGENDA_POINTS_PLACEHOLDER, TOPIC_PLACEHOLDER } from "@shared/topicPrompt";
import { buildMeetingCharactersPayload, buildTopicFromSelection, orderSelectedCharactersForMuseum } from "@newMeeting/meetingSetup";

vi.mock("@newMeeting/CharacterSetup", () => ({
  getCharacterSetupBundle: () => ({
    panelWithHumans: " [HUMANS] ",
    characters: [
      {
        id: "chair",
        name: "Chair",
        description: "Moderator",
        voice: "alloy",
        prompt: `Welcome [CHARACTERS].[HUMANS] Agenda: ${RANDOM_AGENDA_POINT_PLACEHOLDER}`,
      },
      {
        id: "food-a",
        name: "Food A",
        description: "A food",
        voice: "alloy",
        prompt: "Speak as Food A.",
      },
      {
        id: "food-b",
        name: "Food B",
        description: "Another food",
        voice: "alloy",
        prompt: "Speak as Food B.",
      },
    ],
  }),
}));

const topicsBundle = {
  language: "en",
  system: `System intro.\n\n${TOPIC_PLACEHOLDER}\n${AGENDA_POINTS_PLACEHOLDER}\n\nSystem outro.`,
  custom_topic: {
    id: "customtopic",
    title: "Custom Topic",
    description: "",
    prompt: "",
  },
  topics: [
    {
      id: "forestry",
      title: "Forestry",
      description: "Forest topic",
      prompt: "Topic context.",
      agendaPoints: ["Point one", "Point two"],
    },
  ],
};

function buildCharactersPayload(agendaPoints?: string[]) {
  return buildMeetingCharactersPayload({
    language: "en",
    selectedCharacters: ["chair", "food-a", "food-b"],
    humans: [],
    numberOfHumans: 0,
    labels: { oneHuman: "Human: ", twoHumansSuffix: " humans: " },
    agendaPoints,
  });
}

describe("buildTopicFromSelection", () => {
  it("builds the system prompt with numbered agenda points", () => {
    const topic = buildTopicFromSelection({
      topicsBundle,
      selectedTopicId: "forestry",
      customTopic: "",
    });

    expect(topic.prompt).toContain("Topic context.");
    expect(topic.prompt).toContain("1. Point one");
    expect(topic.prompt).toContain("2. Point two");
    expect(topic.prompt).not.toContain(AGENDA_POINTS_PLACEHOLDER);
    expect(topic.agendaPoints).toEqual(["Point one", "Point two"]);
  });

  it("removes [AGENDA_POINTS] for topics without agenda items", () => {
    const topic = buildTopicFromSelection({
      topicsBundle: {
        ...topicsBundle,
        topics: [
          {
            id: "simple",
            title: "Simple",
            description: "Simple topic",
            prompt: "Only context.",
          },
        ],
      },
      selectedTopicId: "simple",
      customTopic: "",
    });

    expect(topic.prompt).toContain("Only context.");
    expect(topic.prompt).not.toContain(AGENDA_POINTS_PLACEHOLDER);
  });
});

describe("buildMeetingCharactersPayload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("injects a numeric random agenda point when agenda points are provided", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const result = buildCharactersPayload(["One", "Two", "Three", "Four"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chair = result.characters[0] as Character;
    expect(chair.prompt).toContain("Agenda: 3");
    expect(chair.prompt).not.toContain(RANDOM_AGENDA_POINT_PLACEHOLDER);
  });

  it("injects the random-order fallback when agenda points are absent", () => {
    const result = buildCharactersPayload();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chair = result.characters[0] as Character;
    expect(chair.prompt).toContain(RANDOM_AGENDA_POINT_FALLBACK);
    expect(chair.prompt).not.toContain(RANDOM_AGENDA_POINT_PLACEHOLDER);
  });

  it("allows museum panelists without descriptions", () => {
    const result = buildMeetingCharactersPayload({
      language: "en",
      selectedCharacters: ["chair", "food-a", "panelist0", "food-b"],
      humans: [
        {
          id: "panelist0",
          name: "Alex",
          description: "",
          voice: "alloy",
          prompt: "",
        },
      ],
      numberOfHumans: 1,
      labels: { oneHuman: "Human: ", twoHumansSuffix: " humans: " },
      isMuseumMode: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.characters.map((character) => character.id)).toEqual([
      "chair",
      "food-a",
      "panelist0",
      "food-b",
    ]);
    expect(result.characters[0].prompt).toContain("Alex");
    expect(result.characters[0].prompt).not.toContain("Alex, ");
  });
});

describe("orderSelectedCharactersForMuseum", () => {
  it("places panelist second-to-last before the final food", () => {
    expect(
      orderSelectedCharactersForMuseum(["chair", "food-a", "food-b", "panelist0", "food-c"])
    ).toEqual(["chair", "food-a", "food-b", "panelist0", "food-c"]);

    expect(
      orderSelectedCharactersForMuseum(["chair", "food-a", "panelist0", "food-b"])
    ).toEqual(["chair", "food-a", "panelist0", "food-b"]);
  });

  it("returns unchanged when no panelists are selected", () => {
    const input = ["chair", "food-a", "food-b"];
    expect(orderSelectedCharactersForMuseum(input)).toEqual(input);
  });
});
