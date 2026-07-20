import type { Character, Topic } from "@shared/ModelTypes";
import { injectRandomAgendaPoint } from "@shared/agendaPointInjection";
import { buildMeetingSystemPrompt, VISITOR_INPUT_PLACEHOLDER } from "@shared/topicPrompt";
import { toTitleCase } from "@/utils";
import type { TopicsData } from "@main/topicsBundle";
import { getCharacterSetupBundle } from "./CharacterSetup";

export type MeetingCharactersI18n = {
  formatHumanCount: (count: number) => string;
};

export type MeetingSetupPhase = "landing" | "topic" | "characters";

function isPanelistId(id: string): boolean {
  return id.startsWith("panelist");
}

/**
 * In museum mode, place human panelist(s) near the middle of the lineup.
 * When the food count is odd, lean toward the later side (more foods before than after).
 */
export function orderSelectedCharactersForMuseum(selectedCharacters: string[]): string[] {
  const panelists = selectedCharacters.filter(isPanelistId);
  const nonPanelists = selectedCharacters.filter((id) => !isPanelistId(id));

  if (panelists.length === 0 || nonPanelists.length === 0) {
    return selectedCharacters;
  }

  const chair = nonPanelists[0];
  const foods = nonPanelists.slice(1);

  if (foods.length === 0) {
    return [chair, ...panelists];
  }

  const insertAt = Math.ceil(foods.length / 2);
  return [chair, ...foods.slice(0, insertAt), ...panelists, ...foods.slice(insertAt)];
}

export type MeetingSetupUserEvent =
  | {
      type: "topic_previewed";
      topicId: string;
      topicTitle: string;
    }
  | {
      type: "topic_committed";
      topicId: string;
      topicTitle: string;
    };

/**
 * These turns are injected by a barge-in that cuts the agent off mid-speech
 * and truncates its transcript at the cut — so the conversation the model sees
 * ends on an unfinished sentence. Left to itself it tends to simply complete
 * that sentence rather than react to what the visitor just did.
 */
const CUT_OFF_NOTE =
  "If your previous sentence was cut off, do not finish it — react to this instead.";

/**
 * Synthetic user turn describing a click the visitor just made, used to prompt
 * an immediate spoken reaction. Phrased as an instruction rather than a state
 * blob: it is sent with a `response.create`, so the model is being asked to
 * say something, not just to absorb context.
 */
export function buildMeetingSetupReactionMessage(event: MeetingSetupUserEvent): string {
  const situation = event.type === "topic_previewed"
    ? `selected the topic "${event.topicTitle}" on screen, but has not confirmed it yet. React briefly to their choice.`
    : `confirmed the topic "${event.topicTitle}" and moved on to the food selection step. React briefly and help them choose their foods.`;

  return `(The visitor just ${situation} ${CUT_OFF_NOTE})`;
}

export function buildTopicFromSelection(params: {
  topicsBundle: TopicsData;
  selectedTopicId: string;
  customTopic: string;
}): Topic {
  const { topicsBundle, selectedTopicId, customTopic } = params;
  const raw =
    topicsBundle.topics.find((topic: Topic) => topic.id === selectedTopicId) ??
    (selectedTopicId === topicsBundle.custom_topic.id ? topicsBundle.custom_topic : undefined);

  if (!raw) {
    throw new Error(`Topic not found: ${selectedTopicId}`);
  }

  const built = structuredClone(raw);
  if (built.id === topicsBundle.custom_topic.id) {
    built.prompt = (built.prompt || "").replace(VISITOR_INPUT_PLACEHOLDER, customTopic.trim());
    built.description = customTopic;
    built.agendaPoints = undefined;
  }
  built.prompt = buildMeetingSystemPrompt(
    topicsBundle.system,
    built.prompt,
    built.agendaPoints,
    topicsBundle.language,
  );
  return built;
}

/**
 * Validates character-selection state and builds the meeting `characters` payload,
 * including chair `[CHARACTERS]`, `[HUMANS]`, and `[RANDOM_AGENDA_POINT]` prompt injection.
 */
export function buildMeetingCharactersPayload(params: {
  language: string;
  selectedCharacters: string[];
  humans: Character[];
  numberOfHumans: number;
  labels: MeetingCharactersI18n;
  agendaPoints?: string[];
  isMuseumMode?: boolean;
}): { ok: true; characters: Character[] } | { ok: false; error: string } {
  const { language, humans, numberOfHumans, labels, agendaPoints, isMuseumMode = false } = params;
  let { selectedCharacters } = params;

  if (isMuseumMode) {
    selectedCharacters = orderSelectedCharactersForMuseum(selectedCharacters);
  }
  const characterSetupData = getCharacterSetupBundle(language);
  const baseCharacters = characterSetupData.characters;
  const characters = [...baseCharacters, ...humans.slice(0, numberOfHumans)];

  const minMembers = 2 + 1;
  const maxMembers = 6 + 1;

  if (selectedCharacters.filter((id) => !id.startsWith("panelist")).length < minMembers) {
    return {
      ok: false,
      error:
        "Select at least two council members besides the chair (three non-human participants minimum), then try again.",
    };
  }
  if (selectedCharacters.length > maxMembers) {
    return { ok: false, error: "Too many participants (at most six members plus the chair)." };
  }

  const selectedHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));
  for (const humanId of selectedHumans) {
    const index = Number(humanId.slice(-1));
    const human = humans[index];
    if (!human || human.name.length === 0) {
      return {
        ok: false,
        error: "Each human panelist needs a name before starting.",
      };
    }
    if (!isMuseumMode && (human.description?.length ?? 0) === 0) {
      return {
        ok: false,
        error: "Each human panelist needs a name and description before starting.",
      };
    }
  }

  const names = selectedCharacters.map((id) => characters.find((character) => character.id === id)?.name);
  if (names.some((name) => name === undefined)) {
    return { ok: false, error: "Selection references an unknown participant." };
  }
  if (new Set(names).size !== names.length) {
    return { ok: false, error: "All participants must have unique names." };
  }

  const participatingFoods = selectedCharacters.filter((id) => !id.startsWith("panelist"));
  const participatingHumans = selectedCharacters.filter((id) => id.startsWith("panelist"));

  let participants = "";
  for (const [index, id] of participatingFoods.entries()) {
    const character = characters.find((item) => item.id === id);
    if (index !== 0 && character) {
      participants += `${toTitleCase(character.name)}, `;
    }
  }
  if (participants.length > 2) {
    participants = participants.substring(0, participants.length - 2);
  }

  const replacedCharacters: Character[] = [];
  for (const id of selectedCharacters) {
    const found = characters.find((character) => character.id === id);
    if (found) {
      replacedCharacters.push(structuredClone(found));
    }
  }

  if (replacedCharacters.length > 0 && replacedCharacters[0].prompt) {
    replacedCharacters[0].prompt =
      characterSetupData.characters[0].prompt?.replace("[CHARACTERS]", participants) || "";
  }

  let humanPresentation = "";
  if (participatingHumans.length > 0) {
    humanPresentation += labels.formatHumanCount(participatingHumans.length);

    for (const id of participatingHumans) {
      const human = characters.find((character) => character.id === id);
      if (human) {
        const role = human.description?.trim() || "guest";
        humanPresentation += `${toTitleCase(human.name)} (${role}). `;
      }
    }
    humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

    humanPresentation = characterSetupData.panelWithHumans.replace("[HUMANS]", humanPresentation);
  }

  if (replacedCharacters.length > 0 && replacedCharacters[0].prompt) {
    replacedCharacters[0].prompt = replacedCharacters[0].prompt.replace("[HUMANS]", humanPresentation);
    replacedCharacters[0].prompt = injectRandomAgendaPoint(replacedCharacters[0].prompt, agendaPoints);
  }

  return { ok: true, characters: replacedCharacters };
}

export type MeetingFoodsI18n = MeetingCharactersI18n;
export const buildMeetingFoodsPayload = buildMeetingCharactersPayload;
