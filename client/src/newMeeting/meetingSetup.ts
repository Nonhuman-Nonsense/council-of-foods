import type { Topic } from "@shared/ModelTypes";
import { toTitleCase } from "@/utils";
import type { TopicsData } from "@/components/topicsBundle";
import { getFoodsBundle } from "@/components/settings/FoodUtils";
import type { Food } from "@/components/settings/FoodUtils";

export type MeetingFoodsI18n = {
  oneHuman: string;
  twoHumansSuffix: string;
};

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
    step: "foods",
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
    topicsBundle.topics.find((topic) => topic.id === selectedTopicId) ??
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
 * Validates foods-step state and builds the `Food[]` passed to `createMeeting`,
 * including chair `[FOODS]` / `[HUMANS]` prompt injection.
 */
export function buildMeetingFoodsPayload(params: {
  language: string;
  selectedFoods: string[];
  humans: Food[];
  numberOfHumans: number;
  labels: MeetingFoodsI18n;
}): { ok: true; foods: Food[] } | { ok: false; error: string } {
  const { language, selectedFoods, humans, numberOfHumans, labels } = params;
  const foodData = getFoodsBundle(language);
  const baseFoods = foodData.foods;
  const foods = [...baseFoods, ...humans.slice(0, numberOfHumans)];

  const minFoods = 2 + 1;
  const maxFoods = 6 + 1;

  if (selectedFoods.filter((id) => !id.startsWith("panelist")).length < minFoods) {
    return {
      ok: false,
      error:
        "Select at least two foods besides the chair (three non-human participants minimum), then try again.",
    };
  }
  if (selectedFoods.length > maxFoods) {
    return { ok: false, error: "Too many participants (at most six foods plus the chair)." };
  }

  const selectedHumans = selectedFoods.filter((id) => id.startsWith("panelist"));
  for (const humanId of selectedHumans) {
    const index = Number(humanId.slice(-1));
    const human = humans[index];
    if (human && (human.name.length === 0 || human.description.length === 0)) {
      return {
        ok: false,
        error: "Each human panelist needs a name and description before starting.",
      };
    }
  }

  const names = selectedFoods.map((id) => foods.find((food) => food.id === id)?.name);
  if (names.some((name) => name === undefined)) {
    return { ok: false, error: "Selection references an unknown participant." };
  }
  if (new Set(names).size !== names.length) {
    return { ok: false, error: "All participants must have unique names." };
  }

  const participatingFoods = selectedFoods.filter((id) => !id.startsWith("panelist"));
  const participatingHumans = selectedFoods.filter((id) => id.startsWith("panelist"));

  let participants = "";
  for (const [index, id] of participatingFoods.entries()) {
    const food = foods.find((item) => item.id === id);
    if (index !== 0 && food) {
      participants += `${toTitleCase(food.name)}, `;
    }
  }
  if (participants.length > 2) {
    participants = participants.substring(0, participants.length - 2);
  }

  const replacedFoods: Food[] = [];
  for (const id of selectedFoods) {
    const found = foods.find((food) => food.id === id);
    if (found) {
      replacedFoods.push(structuredClone(found));
    }
  }

  if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
    replacedFoods[0].prompt = foodData.foods[0].prompt?.replace("[FOODS]", participants) || "";
  }

  let humanPresentation = "";
  if (participatingHumans.length > 0) {
    if (participatingHumans.length === 1) {
      humanPresentation += labels.oneHuman;
    } else {
      humanPresentation += participatingHumans.length + labels.twoHumansSuffix;
    }

    for (const id of participatingHumans) {
      const human = foods.find((food) => food.id === id);
      if (human) {
        humanPresentation += `${toTitleCase(human.name)}, ${human.description}. `;
      }
    }
    humanPresentation = humanPresentation.substring(0, humanPresentation.length - 2);

    humanPresentation = foodData.panelWithHumans.replace("[HUMANS]", humanPresentation);
  }

  if (replacedFoods.length > 0 && replacedFoods[0].prompt) {
    replacedFoods[0].prompt = replacedFoods[0].prompt.replace("[HUMANS]", humanPresentation);
  }

  return { ok: true, foods: replacedFoods };
}
