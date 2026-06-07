import type { Character, Topic } from "@shared/ModelTypes";
import { toTitleCase } from "@/utils";
import type { TopicsData } from "@main/topicsBundle";
import { getCharacterSetupBundle } from "./CharacterSetup";

export type MeetingCharactersI18n = {
  oneHuman: string;
  twoHumansSuffix: string;
};

export type MeetingSetupPhase = "landing" | "topic" | "characters";

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

export function buildMeetingSetupSyncMessage(event: MeetingSetupUserEvent): string {
  if (event.type === "topic_previewed") {
    return `(STATE SYNC: ${JSON.stringify({
      source: "user",
      type: "topic_previewed",
      step: "topic",
      topicId: event.topicId,
      topicTitle: event.topicTitle,
    })})`;
  }

  return `(STATE SYNC: ${JSON.stringify({
    source: "user",
    type: "topic_committed",
    step: "characters",
    topicId: event.topicId,
    topicTitle: event.topicTitle,
  })})`;
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
    built.prompt = customTopic;
    built.description = customTopic;
  }
  built.prompt = topicsBundle.system.replace("[TOPIC]", built.prompt);
  return built;
}

/**
 * Validates character-selection state and builds the meeting `characters` payload,
 * including chair `[CHARACTERS]` / `[HUMANS]` prompt injection.
 */
export function buildMeetingCharactersPayload(params: {
  language: string;
  selectedCharacters: string[];
  humans: Character[];
  numberOfHumans: number;
  labels: MeetingCharactersI18n;
}): { ok: true; characters: Character[] } | { ok: false; error: string } {
  const { language, selectedCharacters, humans, numberOfHumans, labels } = params;
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
    if (human && (human.name.length === 0 || (human.description?.length ?? 0) === 0)) {
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
    if (participatingHumans.length === 1) {
      humanPresentation += labels.oneHuman;
    } else {
      humanPresentation += participatingHumans.length + labels.twoHumansSuffix;
    }

    for (const id of participatingHumans) {
      const human = characters.find((character) => character.id === id);
      if (human) {
        humanPresentation += `${toTitleCase(human.name)}, ${human.description}. `;
      }
    }
    humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

    humanPresentation = characterSetupData.panelWithHumans.replace("[HUMANS]", humanPresentation);
  }

  if (replacedCharacters.length > 0 && replacedCharacters[0].prompt) {
    replacedCharacters[0].prompt = replacedCharacters[0].prompt.replace("[HUMANS]", humanPresentation);
  }

  return { ok: true, characters: replacedCharacters };
}

export type MeetingFoodsI18n = MeetingCharactersI18n;
export const buildMeetingFoodsPayload = buildMeetingCharactersPayload;
