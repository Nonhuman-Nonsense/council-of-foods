import type { Topic, Character } from "@shared/ModelTypes";
import type { Food } from "@/components/settings/SelectFoods";

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
export type GuideFood = Pick<Character, "id" | "name"> & { description?: string };

export type GuideToolContext = {
  topics: GuideTopic[];
  foods: GuideFood[];

  // Wizard state (lifted in NewMeeting)
  selectedTopic: string;
  setSelectedTopic: (id: string) => void;
  customTopic: string;
  setCustomTopic: (text: string) => void;

  selectedFoods: string[];
  setSelectedFoods: React.Dispatch<React.SetStateAction<string[]>>;
  humans: Food[];
  setHumans: React.Dispatch<React.SetStateAction<Food[]>>;
  numberOfHumans: number;
  setNumberOfHumans: React.Dispatch<React.SetStateAction<number>>;

  // Imperative handoff points (Phase 3 wires these)
  buildSelectedTopicFromUi: () => Topic;
  confirmTopic: (topic: Topic) => void;
  startMeeting: (foods: Food[]) => void | Promise<void>;
};

function asObject(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null;
  return args as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function createGuideTools(_ctx: Pick<GuideToolContext, "topics" | "foods">): RealtimeTool[] {
  return [
    {
      type: "function",
      name: "list_topics",
      description: "List available topics (id + title).",
      parameters: { type: "object", additionalProperties: false },
    },
    {
      type: "function",
      name: "describe_topic",
      description: "Describe a topic by id.",
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
      description: "Select a topic by id.",
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
      description: "Select the custom topic and set the custom topic text.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      type: "function",
      name: "confirm_topic",
      description:
        "Confirm the current topic selection and proceed to the foods step (same as clicking Next).",
      parameters: { type: "object", additionalProperties: false },
    },
    {
      type: "function",
      name: "list_foods",
      description: "List available foods (id + name).",
      parameters: { type: "object", additionalProperties: false },
    },
    {
      type: "function",
      name: "describe_food",
      description: "Describe a food character by id.",
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
      description: "Select a food character by id.",
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
      description: "Deselect a food character by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { foodId: { type: "string" } },
        required: ["foodId"],
      },
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
      return { ok: true, data: found };
    },
    select_topic: (raw) => {
      const obj = asObject(raw);
      const topicId = asString(obj?.topicId);
      if (!topicId) return { ok: false, error: "Missing topicId" };
      if (!ctx.topics.some((t) => t.id === topicId) && topicId !== "customtopic") {
        return { ok: false, error: `Unknown topicId: ${topicId}` };
      }
      ctx.setSelectedTopic(topicId);
      return { ok: true };
    },
    set_custom_topic: (raw) => {
      const obj = asObject(raw);
      const text = asString(obj?.text);
      if (!text) return { ok: false, error: "Missing text" };
      ctx.setSelectedTopic("customtopic");
      ctx.setCustomTopic(text);
      return { ok: true };
    },
    confirm_topic: () => {
      if (!ctx.selectedTopic) return { ok: false, error: "No topic selected" };
      const topic = ctx.buildSelectedTopicFromUi();
      ctx.confirmTopic(topic);
      return { ok: true };
    },
    list_foods: () => ({
      ok: true,
      data: ctx.foods.map((f) => ({ id: f.id, name: f.name })),
    }),
    describe_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      const found = ctx.foods.find((f) => f.id === foodId);
      if (!found) return { ok: false, error: `Unknown foodId: ${foodId}` };
      return { ok: true, data: found };
    },
    select_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      if (!ctx.foods.some((f) => f.id === foodId) && !foodId.startsWith("panelist")) {
        return { ok: false, error: `Unknown foodId: ${foodId}` };
      }
      ctx.setSelectedFoods((prev) => (prev.includes(foodId) ? prev : [...prev, foodId]));
      return { ok: true };
    },
    deselect_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      ctx.setSelectedFoods((prev) => prev.filter((id) => id !== foodId));
      return { ok: true };
    },
  };
}

