import type { Topic, Character } from "@shared/ModelTypes";
import { buildMeetingCharactersPayload, type MeetingCharactersI18n } from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@stores/useMeetingSetupStore";
import type { VoiceGuidePromptBundle } from "./guidePrompt";

export type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type RealtimeFunctionTool = {
  type: "function";
  name: string;
  description?: string;
  parameters?: JsonSchemaObject;
};

export type RealtimeTool = RealtimeFunctionTool;

export type ToolResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export type ToolHandler = (args: unknown) => Promise<ToolResult> | ToolResult;

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideCharacter = Pick<Character, "id" | "name"> & { description?: string };

export type GuideToolContext = {
  topics: GuideTopic[];
  characters: GuideCharacter[];

  // Imperative handoff points (Phase 3 wires these)
  goToTopicStep: () => void;
  buildSelectedTopic: () => Topic;
  selectTopic: (topic: Topic) => void;
  startMeeting: (characters: Character[]) => void | Promise<void>;

  meetingStep: "topic" | "foods";
  voiceGuideLanguage: string;
  meetingCharactersLabels: MeetingCharactersI18n;
};

function asObject(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null;
  return args as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function createGuideTools(params: {
  promptBundle: VoiceGuidePromptBundle;
}): RealtimeTool[] {
  const copy = params.promptBundle.toolDescriptions;
  return [
    {
      type: "function",
      name: "list_topics",
      description: copy.list_topics,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "describe_topic",
      description: copy.describe_topic,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { topicId: { type: "string" } },
        required: ["topicId"],
      },
    },
    {
      type: "function",
      name: "select_topic",
      description: copy.select_topic,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { topicId: { type: "string" } },
        required: ["topicId"],
      },
    },
    {
      type: "function",
      name: "set_custom_topic",
      description: copy.set_custom_topic,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      type: "function",
      name: "go_to_topic_step",
      description: copy.go_to_topic_step,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "list_foods",
      description: copy.list_foods,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "describe_food",
      description: copy.describe_food,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { foodId: { type: "string" } },
        required: ["foodId"],
      },
    },
    {
      type: "function",
      name: "select_food",
      description: copy.select_food,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { foodId: { type: "string" } },
        required: ["foodId"],
      },
    },
    {
      type: "function",
      name: "highlight_food",
      description: copy.highlight_food,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { foodId: { type: "string" } },
        required: ["foodId"],
      },
    },
    {
      type: "function",
      name: "deselect_food",
      description: copy.deselect_food,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { foodId: { type: "string" } },
        required: ["foodId"],
      },
    },
    {
      type: "function",
      name: "start_meeting",
      description: copy.start_meeting,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

export function createGuideToolHandlers(ctx: GuideToolContext): Record<string, ToolHandler> {
  return {
    list_topics: () => ({
      ok: true,
      data: ctx.topics.map((t) => ({ id: t.id, title: t.title })),
    }),
    describe_topic: (raw) => {
      const obj = asObject(raw);
      const topicId = asString(obj?.topicId);
      if (!topicId) return { ok: false, error: "Missing topicId" };
      const found = ctx.topics.find((t) => t.id === topicId);
      if (!found) return { ok: false, error: `Unknown topicId: ${topicId}` };
      useMeetingSetupStore.getState().setSelectedTopic(topicId);
      return { ok: true, data: found };
    },
    select_topic: (raw) => {
      const obj = asObject(raw);
      const topicId = asString(obj?.topicId);
      if (!topicId) return { ok: false, error: "Missing topicId" };
      if (!ctx.topics.some((t) => t.id === topicId) && topicId !== "customtopic") {
        return { ok: false, error: `Unknown topicId: ${topicId}` };
      }
      const store = useMeetingSetupStore.getState();
      store.setSelectedTopic(topicId);
      if (topicId === "customtopic" && !store.customTopic.trim()) {
        return { ok: false, error: "Set the custom topic text before choosing the custom topic." };
      }
      const topic = ctx.buildSelectedTopic();
      ctx.selectTopic(topic);
      return { ok: true };
    },
    set_custom_topic: (raw) => {
      const obj = asObject(raw);
      const text = asString(obj?.text);
      if (!text) return { ok: false, error: "Missing text" };
      useMeetingSetupStore.getState().setSelectedTopic("customtopic");
      useMeetingSetupStore.getState().setCustomTopic(text);
      return { ok: true };
    },
    go_to_topic_step: () => {
      ctx.goToTopicStep();
      return { ok: true };
    },
    list_foods: () => ({
      ok: true,
      data: ctx.characters.map((character) => ({ id: character.id, name: character.name })),
    }),
    describe_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      const found = ctx.characters.find((character) => character.id === foodId);
      if (!found) return { ok: false, error: `Unknown foodId: ${foodId}` };
      return { ok: true, data: found };
    },
    select_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      if (!ctx.characters.some((character) => character.id === foodId) && !foodId.startsWith("panelist")) {
        return { ok: false, error: `Unknown foodId: ${foodId}` };
      }
      const success = useMeetingSetupStore.getState().handleSelectCharacterId(foodId);
      if (!success) {
        return { ok: false, error: "Maximum number of characters (6 plus the chair) already selected." };
      }
      return { ok: true };
    },
    highlight_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) {
        useMeetingSetupStore.getState().setHoveredCharacter(null);
        return { ok: true };
      }
      if (
        !ctx.characters.some((character) => character.id === foodId) &&
        !foodId.startsWith("panelist") &&
        foodId !== "addhuman"
      ) {
        return { ok: false, error: `Unknown foodId: ${foodId}` };
      }
      useMeetingSetupStore.getState().setHoveredCharacter(foodId);
      return { ok: true };
    },
    deselect_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      useMeetingSetupStore.getState().handleDeselectCharacterId(foodId);
      return { ok: true };
    },
    start_meeting: async () => {
      if (ctx.meetingStep !== "foods") {
        return {
          ok: false,
          error: "Choose a topic first; start_meeting only works on the foods step after select_topic.",
        };
      }
      const { selectedCharacters, humans, numberOfHumans } = useMeetingSetupStore.getState();
      const built = buildMeetingCharactersPayload({
        language: ctx.voiceGuideLanguage,
        selectedCharacters,
        humans,
        numberOfHumans,
        labels: ctx.meetingCharactersLabels,
      });
      if (!built.ok) return built;
      await Promise.resolve(ctx.startMeeting(built.characters));
      return { ok: true, data: { started: true } };
    },
  };
}

