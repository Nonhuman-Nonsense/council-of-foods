// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Character } from "@shared/ModelTypes";
import { RANDOM_AGENDA_POINT_PLACEHOLDER, RANDOM_AGENDA_POINT_FALLBACK } from "@shared/agendaPointInjection";
import { AGENDA_POINTS_PLACEHOLDER, TOPIC_PLACEHOLDER } from "@shared/topicPrompt";
import { buildMeetingCharactersPayload, buildMeetingSetupReactionMessage, buildTopicFromSelection, diffCouncil, getMeetingSetupReactionDelayMs, orderSelectedCharactersForMuseum, selectedFoodNames } from "@newMeeting/meetingSetup";

vi.mock("@newMeeting/CharacterSetup", () => ({
  CHAIR_ID: "chair",
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
  metadata: { version: "1.0.0", last_updated: "2026-01-01" },
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
    labels: { formatHumanCount: (count) => (count === 1 ? "1 human: " : `${count} humans: `) },
    agendaPoints,
  });
}

describe("selectedFoodNames", () => {
  const characters = [
    { id: "chair", name: "Chair" },
    { id: "food-a", name: "Food A" },
    { id: "food-b", name: "Food B" },
  ];

  it("lists the visitor's picks without the chair or human panelists", () => {
    const names = selectedFoodNames(["chair", "food-a", "panelist0", "food-b"], characters);

    expect(names).toEqual(["Food A", "Food B"]);
  });

  it("skips ids with no matching character", () => {
    expect(selectedFoodNames(["chair", "food-a", "gone"], characters)).toEqual(["Food A"]);
  });
});

describe("diffCouncil", () => {
  /**
   * Reactions are debounced, so one message can cover several clicks. Diffing
   * against what the agent was last told is what lets it say "bean and meat"
   * instead of reacting only to the final click.
   */
  it("reports every pick made since the agent was last told", () => {
    expect(diffCouncil([], ["Bean", "Meat"])).toEqual({ added: ["Bean", "Meat"], removed: [] });
  });

  it("reports adds and removals from the same window together", () => {
    expect(diffCouncil(["Bean", "Rice"], ["Bean", "Meat"])).toEqual({
      added: ["Meat"],
      removed: ["Rice"],
    });
  });

  it("reports nothing when the council ended up unchanged", () => {
    expect(diffCouncil(["Bean"], ["Bean"])).toEqual({ added: [], removed: [] });
  });
});

describe("buildMeetingSetupReactionMessage", () => {
  const roster = { selectedNames: ["Bean", "Meat"], chairName: "Water", isFull: false };

  it("reports the visitor leaving the welcome screen", () => {
    // The wording is copy; that this event is reported at all is the contract.
    // Silence here is what left the agent working from the welcome step after a
    // visitor clicked "Let's go" — the only way past it with the mic off.
    expect(buildMeetingSetupReactionMessage({ type: "setup_started" })).not.toBe("");
  });

  it("names every food added since the last reaction, not just the last click", () => {
    const message = buildMeetingSetupReactionMessage(
      { type: "character_selected", ...roster },
      { added: ["Bean", "Meat"], removed: [] },
    );

    expect(message).toContain("Bean");
    expect(message).toContain("Meat");
  });

  /** A food picked and unpicked inside one window leaves nothing to say. */
  it("returns an empty message when the council ended up unchanged", () => {
    const message = buildMeetingSetupReactionMessage(
      { type: "character_selected", selectedNames: ["Bean"], chairName: "Water", isFull: false },
      { added: [], removed: [] },
    );

    expect(message).toBe("");
  });

  it("still describes a randomized council without a diff", () => {
    const message = buildMeetingSetupReactionMessage({ type: "characters_randomized", ...roster });

    expect(message).not.toBe("");
    expect(message).toContain("Bean");
  });

  /**
   * The UI has no room for a 7th pick, so this is the only moment the agent
   * can naturally learn the council is complete. Phrased as an optional aside,
   * not an instruction — the model isn't obligated to mention it every time.
   */
  it("mentions the council is full when isFull is set", () => {
    const message = buildMeetingSetupReactionMessage(
      { type: "character_selected", selectedNames: ["Bean"], chairName: "Water", isFull: true },
      { added: ["Bean"], removed: [] },
    );

    expect(message.toLowerCase()).toContain("full");
  });

  it("says nothing about being full when there is still room", () => {
    const message = buildMeetingSetupReactionMessage(
      { type: "character_selected", selectedNames: ["Bean"], chairName: "Water", isFull: false },
      { added: ["Bean"], removed: [] },
    );

    expect(message.toLowerCase()).not.toContain("full");
  });

  /** A blank name means the "add human" button just made a fresh slot. */
  it("says a newly added human panelist still needs details", () => {
    const message = buildMeetingSetupReactionMessage({
      type: "human_selected",
      humanName: "",
      humanDescription: "",
      isComplete: false,
      ...roster,
    });

    expect(message.toLowerCase()).toContain("name");
    expect(message.toLowerCase()).toContain("description");
  });

  /**
   * A named panelist reaching this event means an existing one was toggled
   * back in — asking them to fill in details they already have would be wrong.
   */
  it("names a panelist brought back in rather than asking for details again", () => {
    const message = buildMeetingSetupReactionMessage({
      type: "human_selected",
      humanName: "Leo Fidjeland",
      humanDescription: "A curious visitor",
      isComplete: true,
      ...roster,
    });

    expect(message).toContain("Leo Fidjeland");
    expect(message.toLowerCase()).not.toContain("still need");
  });

  it("names who was taken out when a panelist is deselected", () => {
    const message = buildMeetingSetupReactionMessage({
      type: "human_deselected",
      deselectedName: "Leo Fidjeland",
      selectedNames: [],
      chairName: "Water",
      isFull: false,
      panelistNames: [],
    });

    expect(message).toContain("Leo Fidjeland");
    expect(message.toLowerCase()).toContain("out of the council");
  });

  /**
   * Mirrors the UI's own per-panelist readiness check: name always required,
   * description required outside museum mode. The agent shouldn't ask for
   * something the visitor was never asked to provide.
   */
  describe("human details", () => {
    it("invites a reaction to the description once both fields are filled", () => {
      const message = buildMeetingSetupReactionMessage({
        type: "human_details_confirmed",
        humanName: "Alex",
        humanDescription: "A curious economist",
        isComplete: true,
        ...roster,
      });

      expect(message).toContain("Alex");
      expect(message).toContain("A curious economist");
    });

    it("names a missing name specifically, not description", () => {
      const message = buildMeetingSetupReactionMessage({
        type: "human_details_typed",
        humanName: "",
        humanDescription: "A curious economist",
        isComplete: false,
        ...roster,
      });

      expect(message.toLowerCase()).toContain("name");
      expect(message.toLowerCase()).not.toContain("description");
    });

    it("names a missing description specifically, not name", () => {
      const message = buildMeetingSetupReactionMessage({
        type: "human_details_typed",
        humanName: "Alex",
        humanDescription: "",
        isComplete: false,
        ...roster,
      });

      expect(message.toLowerCase()).toContain("description");
      expect(message).toContain("Alex");
    });

    it("names both as missing when neither is filled", () => {
      const message = buildMeetingSetupReactionMessage({
        type: "human_details_typed",
        humanName: "",
        humanDescription: "",
        isComplete: false,
        ...roster,
      });

      expect(message.toLowerCase()).toContain("name");
      expect(message.toLowerCase()).toContain("description");
    });

    /**
     * The reported bug: the message said "the visitor just finished
     * describing a panelist" and, in the same breath, "the council is
     * currently just yourself, the moderator" — omitting the very panelist it
     * just described. That contradiction led the agent to call the
     * add-panelist tool again and create a duplicate.
     */
    it("includes the panelist in the roster line rather than contradicting itself", () => {
      const message = buildMeetingSetupReactionMessage({
        type: "human_details_confirmed",
        humanName: "Leo Fidjeland",
        humanDescription: "I am not sure what to write here",
        isComplete: true,
        selectedNames: [],
        chairName: "Water",
        isFull: false,
        panelistNames: ["Leo Fidjeland"],
      });

      expect(message).not.toContain("currently just yourself");
      expect(message).toContain("Leo Fidjeland");
    });

    it.each(["human_selected", "human_details_typed", "human_details_confirmed"] as const)(
      "tells the agent not to call the add-panelist tool for a %s event",
      (type) => {
        const message = buildMeetingSetupReactionMessage({
          type,
          humanName: "Alex",
          humanDescription: "A curious economist",
          isComplete: true,
          ...roster,
        } as Parameters<typeof buildMeetingSetupReactionMessage>[0]);

        expect(message).toContain("human_panelist");
        expect(message.toLowerCase()).toContain("already saved");
      },
    );
  });
});

describe("getMeetingSetupReactionDelayMs", () => {
  const roster = { selectedNames: ["Beef"], chairName: "Water", isFull: false };

  /**
   * The visitor picks up to six foods, so character clicks arrive in bursts;
   * reacting to each one would interrupt the agent repeatedly. Topic picks are
   * one-shot and can react almost immediately.
   */
  it("gives character picks a longer coalescing window than topic picks", () => {
    const topicDelay = getMeetingSetupReactionDelayMs({
      type: "topic_previewed",
      topicId: "food-waste",
      topicTitle: "Food Waste",
    });
    const characterDelay = getMeetingSetupReactionDelayMs({
      type: "character_selected",
      ...roster,
    });

    expect(topicDelay).toBeLessThan(characterDelay);
  });

  /**
   * Both take the whole screen with them and cannot be clicked twice, so a
   * coalescing window would only ever be dead air before the agent reacts.
   */
  it("reacts immediately to a step change that cannot be undone", () => {
    expect(getMeetingSetupReactionDelayMs({ type: "setup_started" })).toBe(0);
    expect(
      getMeetingSetupReactionDelayMs({
        type: "topic_committed",
        topicId: "food-waste",
        topicTitle: "Food Waste",
      }),
    ).toBe(0);
  });

  it("still lets a topic preview settle before reacting", () => {
    // Unlike committing, previewing can be redone by clicking the next topic.
    const previewDelay = getMeetingSetupReactionDelayMs({
      type: "topic_previewed",
      topicId: "food-waste",
      topicTitle: "Food Waste",
    });

    expect(previewDelay).toBeGreaterThan(0);
  });

  it("uses one window for every kind of character change", () => {
    const delays = [
      getMeetingSetupReactionDelayMs({ type: "character_selected", ...roster }),
      getMeetingSetupReactionDelayMs({ type: "character_deselected", ...roster }),
      getMeetingSetupReactionDelayMs({ type: "characters_randomized", ...roster }),
    ];

    expect(new Set(delays).size).toBe(1);
  });

  const humanDetails = { humanName: "Alex", humanDescription: "", isComplete: false, ...roster };

  /**
   * A typing pause could just be the visitor thinking mid-sentence, so it
   * needs a long window — long enough that reacting to a genuine pause still
   * feels responsive, but short false-triggers on ordinary pauses don't.
   */
  it("gives a typing pause a longer window than a confirmed pick", () => {
    const typingDelay = getMeetingSetupReactionDelayMs({ type: "human_details_typed", ...humanDetails });
    const characterDelay = getMeetingSetupReactionDelayMs({ type: "character_selected", ...roster });

    expect(typingDelay).toBeGreaterThan(characterDelay);
  });

  /**
   * Leaving the field is a deliberate "I'm done" signal — it should react
   * promptly rather than waiting out whatever's left of the typing window.
   */
  it("reacts to a confirmed pick as promptly as leaving the field", () => {
    const confirmedDelay = getMeetingSetupReactionDelayMs({ type: "human_details_confirmed", ...humanDetails });
    const typingDelay = getMeetingSetupReactionDelayMs({ type: "human_details_typed", ...humanDetails });

    expect(confirmedDelay).toBeLessThan(typingDelay);
  });
});

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

    it("replaces [CHARACTERS] with non-chair participants", () => {
        const result = buildCharactersPayload();
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const chair = result.characters[0] as Character;
        expect(chair.prompt).not.toContain("[CHARACTERS]");
        expect(chair.prompt).toContain("Food A");
        expect(chair.prompt).toContain("Food B");
        expect(chair.prompt).not.toContain("Chair");
    });

    it("replaces [HUMANS] with panelist presentation", () => {
        const result = buildMeetingCharactersPayload({
            language: "en",
            selectedCharacters: ["chair", "food-a", "food-b", "panelist0"],
            humans: [
                {
                    id: "panelist0",
                    name: "Alice",
                    description: "A thoughtful human",
                    voice: "alloy",
                    prompt: "",
                },
            ],
            numberOfHumans: 1,
            labels: { formatHumanCount: (count) => (count === 1 ? "1 human: " : `${count} humans: `) },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const chair = result.characters[0] as Character;
        expect(chair.prompt).not.toContain("[HUMANS]");
        expect(chair.prompt).toContain("Alice (A thoughtful human)");
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
      labels: { formatHumanCount: (count) => (count === 1 ? "1 human: " : `${count} humans: `) },
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
    expect(result.characters[0].prompt).toContain("Alex (guest)");
  });

  it("uses plural human count label for multiple panelists", () => {
    const result = buildMeetingCharactersPayload({
      language: "en",
      selectedCharacters: ["chair", "food-a", "panelist0", "panelist1", "food-b"],
      humans: [
        { id: "panelist0", name: "Alice", description: "One", voice: "alloy", prompt: "" },
        { id: "panelist1", name: "Bob", description: "Two", voice: "alloy", prompt: "" },
      ],
      numberOfHumans: 2,
      labels: { formatHumanCount: (count) => (count === 1 ? "1 human: " : `${count} humans: `) },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.characters[0].prompt).toContain("2 humans: ");
    expect(result.characters[0].prompt).toContain("Alice (One)");
    expect(result.characters[0].prompt).toContain("Bob (Two)");
  });
});

describe("orderSelectedCharactersForMuseum", () => {
  it("places panelist near the middle, leaning later when food count is odd", () => {
    expect(
      orderSelectedCharactersForMuseum(["chair", "food-a", "panelist0", "food-b"])
    ).toEqual(["chair", "food-a", "panelist0", "food-b"]);

    expect(
      orderSelectedCharactersForMuseum(["chair", "food-a", "food-b", "panelist0", "food-c"])
    ).toEqual(["chair", "food-a", "food-b", "panelist0", "food-c"]);

    expect(
      orderSelectedCharactersForMuseum([
        "chair",
        "food-a",
        "food-b",
        "panelist0",
        "food-c",
        "food-d",
      ])
    ).toEqual(["chair", "food-a", "food-b", "panelist0", "food-c", "food-d"]);
  });

  it("returns unchanged when no panelists are selected", () => {
    const input = ["chair", "food-a", "food-b"];
    expect(orderSelectedCharactersForMuseum(input)).toEqual(input);
  });
});
