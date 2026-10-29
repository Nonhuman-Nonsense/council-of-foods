import type { Meeting } from "@shared/ModelTypes";
import { getMeetingIdFromPathname } from "@/navigation";
import { getTopicsBundle } from "@main/topicsBundle";

/**
 * The screen a replay opens on when someone lands straight on it (see `ReplayIntro`). It is a
 * hash overlay like #about, so the meeting holds paused under it the way it does under any
 * other: `#email` for the link in a letter's footer, `#replay` for any other way in.
 */
export type ReplayIntroKind = "email" | "replay";

export const REPLAY_INTRO_HASHES: readonly string[] = ["#email", "#replay"];

export function replayIntroKindOf(hash: string): ReplayIntroKind | null {
  if (hash === "#email") return "email";
  if (hash === "#replay") return "replay";
  return null;
}

/**
 * Offers the intro once, and only for the meeting the page was opened on: a replay reached from
 * inside the app — autoplay, going back to it — plays straight away.
 */
export function createReplayIntroOffer(landing: { pathname: string; hash: string }) {
  const landedOn = getMeetingIdFromPathname(landing.pathname);
  let offered = false;
  return (meetingId: string): ReplayIntroKind | null => {
    if (offered || landedOn === undefined || landedOn !== meetingId) return null;
    offered = true;
    return landing.hash === "#email" ? "email" : "replay";
  };
}

/** Where this page load began, read before the app navigates anywhere. */
export const takeReplayIntro = createReplayIntroOffer({
  pathname: window.location.pathname,
  hash: window.location.hash,
});

export interface ReplayIntroParticipant {
  name: string;
  human: boolean;
}

export interface ReplayIntroFacts {
  meetingId: number;
  /** The listed topic's title; null for a visitor's own question, whose title says nothing. */
  topic: string | null;
  /** The topic's one line from the topic screen, or the visitor's own question. */
  topicDescription: string | null;
  /** The agenda point the chair opened on; null for a visitor's own question, or before it was kept. */
  agendaPoint: string | null;
  date: string;
  venueName: string | null;
  /** The being who wrote the meeting's letter, when it ended in one. */
  letterAuthor: string | null;
  participants: ReplayIntroParticipant[];
}

/** What the intro says about a meeting, read off its replay. */
export function replayIntroFacts(meeting: Meeting): ReplayIntroFacts {
  const participants: ReplayIntroParticipant[] = meeting.characters.map((character) => ({
    name: character.name,
    human: character.id.startsWith("panelist"),
  }));
  // The visitor taking part from the audience; on an installation they can also be a panelist.
  const humanName = meeting.state?.humanName?.trim();
  if (humanName && !participants.some((p) => p.name === humanName)) {
    participants.push({ name: humanName, human: true });
  }

  const letterAuthor = meeting.conversation
    .flatMap((message) => (message.type === "summary" && message.letter ? [message.letter.authorName] : []))
    .at(-1) ?? null;

  const customTopic = meeting.topic.id === getTopicsBundle(meeting.language).custom_topic.id;

  return {
    meetingId: meeting._id,
    topic: customTopic ? null : meeting.topic.title,
    topicDescription: meeting.topic.description?.trim() || null,
    agendaPoint: customTopic ? null : meeting.openingAgendaPoint?.trim() || null,
    date: meeting.date,
    venueName: meeting.venueName ?? null,
    letterAuthor,
    participants,
  };
}
