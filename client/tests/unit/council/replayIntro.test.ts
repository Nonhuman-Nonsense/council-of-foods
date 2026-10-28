import { describe, it, expect } from "vitest";
import { createReplayIntroOffer, replayIntroFacts } from "@council/replayIntro";
import type { Meeting, Message } from "@shared/ModelTypes";
import { MockFactory } from "../factories/MockFactory";

describe("createReplayIntroOffer", () => {
  it.each([
    { landing: { pathname: "/en/meeting/1506", hash: "#email" }, meetingId: "1506", expected: "email" },
    { landing: { pathname: "/en/meeting/1506", hash: "" }, meetingId: "1506", expected: "replay" },
    { landing: { pathname: "/en/meeting/1506", hash: "#about" }, meetingId: "1506", expected: "replay" },
    { landing: { pathname: "/en/meeting/1506", hash: "#email" }, meetingId: "1507", expected: null },
    { landing: { pathname: "/en/", hash: "" }, meetingId: "1506", expected: null },
    { landing: { pathname: "/en/new", hash: "#email" }, meetingId: "1506", expected: null },
  ])("landing on $landing.pathname$landing.hash offers $expected for meeting $meetingId", ({ landing, meetingId, expected }) => {
    expect(createReplayIntroOffer(landing)(meetingId)).toBe(expected);
  });

  it("offers the intro only once per page load, so returning to the meeting plays straight away", () => {
    const take = createReplayIntroOffer({ pathname: "/en/meeting/1506", hash: "" });
    expect(take("1506")).toBe("replay");
    expect(take("1506")).toBeNull();
  });
});

describe("replayIntroFacts", () => {
  function meeting(overrides: Partial<Meeting> = {}): Meeting {
    return {
      _id: 1506,
      date: "2026-10-10T12:00:00.000Z",
      topic: MockFactory.createTopic({ title: "Mining in Kalix" }),
      characters: [MockFactory.createCharacter({ id: "river", name: "River" })],
      language: "en",
      state: { alreadyInvited: false },
      conversation: [],
      audio: [],
      conversationExtraSlots: 0,
      meetingComplete: true,
      ...overrides,
    };
  }

  const letterSummary = { id: "s", type: "summary", speaker: "reindeer", text: "", letter: { authorName: "Reindeer" } } as Message;

  it.each([
    { name: "a being", characters: [MockFactory.createCharacter({ id: "river", name: "River" })], humanName: undefined, expected: [{ name: "River", human: false }] },
    { name: "a human panelist", characters: [MockFactory.createPanelist(0, { name: "Frank" })], humanName: undefined, expected: [{ name: "Frank", human: true }] },
    { name: "the visitor", characters: [MockFactory.createCharacter({ id: "river", name: "River" })], humanName: "Frank", expected: [{ name: "River", human: false }, { name: "Frank", human: true }] },
    { name: "a visitor who is also the panelist", characters: [MockFactory.createPanelist(0, { name: "Frank" })], humanName: "Frank", expected: [{ name: "Frank", human: true }] },
  ])("lists $name among the participants", ({ characters, humanName, expected }) => {
    const facts = replayIntroFacts(meeting({ characters, state: { alreadyInvited: false, humanName } }));
    expect(facts.participants).toEqual(expected);
  });

  it.each([
    { name: "the letter's author when the meeting ended in one", conversation: [letterSummary], expected: "Reindeer" },
    { name: "no author when it did not", conversation: [{ id: "s", type: "summary", speaker: "river", text: "" } as Message], expected: null },
  ])("names $name", ({ conversation, expected }) => {
    expect(replayIntroFacts(meeting({ conversation })).letterAuthor).toBe(expected);
  });

  it.each([
    {
      name: "a listed topic by its title and one line",
      topic: MockFactory.createTopic({ id: "forestry", title: "Forestry", description: "Can a bioeconomy be sustainable?" }),
      expected: { topic: "Forestry", topicDescription: "Can a bioeconomy be sustainable?", agendaPoint: "Soil Scarification" },
    },
    {
      name: "a visitor's own question by the question, under no title",
      topic: MockFactory.createTopic({ id: "customtopic", title: "Custom Topic", description: "Should wolves come back?" }),
      expected: { topic: null, topicDescription: "Should wolves come back?", agendaPoint: null },
    },
  ])("describes $name", ({ topic, expected }) => {
    const facts = replayIntroFacts(meeting({ topic, openingAgendaPoint: "Soil Scarification" }));
    const { topic: title, topicDescription, agendaPoint } = facts;
    expect({ topic: title, topicDescription, agendaPoint }).toEqual(expected);
  });

  it.each([
    { venueName: "Havremagasinet", expected: "Havremagasinet" },
    { venueName: undefined, expected: null },
  ])("gives the venue as $expected when the meeting has $venueName", ({ venueName, expected }) => {
    expect(replayIntroFacts(meeting({ venueName })).venueName).toBe(expected);
  });
});
