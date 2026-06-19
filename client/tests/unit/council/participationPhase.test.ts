import { describe, it, expect } from "vitest";
import { getParticipationPhase } from "@council/humanInput/participationPhase";
import type { Message } from "@shared/ModelTypes";

function msg(type: Message["type"]): Message {
  return { id: `id-${type}`, speaker: "s", text: "", type } as Message;
}

describe("getParticipationPhase", () => {
  it("returns active for human_input", () => {
    expect(getParticipationPhase("human_input", [], 0)).toBe("active");
  });

  it("returns active for human_panelist", () => {
    expect(getParticipationPhase("human_panelist", [], 0)).toBe("active");
  });

  it("returns warm when next message is awaiting_human_question", () => {
    const messages = [msg("message"), msg("awaiting_human_question")];
    expect(getParticipationPhase("playing", messages, 0)).toBe("warm");
  });

  it("returns warm when next message is awaiting_human_panelist", () => {
    const messages = [msg("invitation"), msg("awaiting_human_panelist")];
    expect(getParticipationPhase("playing", messages, 0)).toBe("warm");
  });

  it("returns warm during invitation (first-time raise hand case)", () => {
    const messages = [msg("message"), msg("invitation"), msg("awaiting_human_question")];
    // playingNowIndex = 1 (invitation is playing), N+1 = awaiting
    expect(getParticipationPhase("playing", messages, 1)).toBe("warm");
  });

  it("returns warm during any speaker when next is awaiting (direct mic, no invitation)", () => {
    const messages = [msg("message"), msg("message"), msg("awaiting_human_question")];
    expect(getParticipationPhase("playing", messages, 1)).toBe("warm");
  });

  it("returns off when next message is a normal speaker message", () => {
    const messages = [msg("message"), msg("message")];
    expect(getParticipationPhase("playing", messages, 0)).toBe("off");
  });

  it("returns off when playingNowIndex+1 is out of bounds", () => {
    const messages = [msg("message")];
    expect(getParticipationPhase("playing", messages, 0)).toBe("off");
  });

  it("returns off for empty messages", () => {
    expect(getParticipationPhase("playing", [], 0)).toBe("off");
  });

  it("returns off for non-human council states even if queue has awaiting", () => {
    const messages = [msg("message"), msg("awaiting_human_question")];
    expect(getParticipationPhase("loading", messages, 0)).toBe("warm");
    expect(getParticipationPhase("summary", messages, 0)).toBe("warm");
  });

  it("returns off after raise-hand truncation removes the awaiting marker", () => {
    // Before truncation: [speaker, panelist, awaiting_human_panelist]
    // playingNowIndex = 1 → warm
    const before = [msg("message"), msg("panelist"), msg("awaiting_human_panelist")];
    expect(getParticipationPhase("playing", before, 1)).toBe("warm");

    // After raise hand: messages.slice(0, playingNowIndex + 1) = [speaker, panelist]
    const after = [msg("message"), msg("panelist")];
    expect(getParticipationPhase("playing", after, 1)).toBe("off");
  });
});
