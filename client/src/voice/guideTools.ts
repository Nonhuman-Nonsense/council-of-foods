import type { Topic, Character } from "@shared/ModelTypes";
import type { Food } from "@/components/settings/FoodUtils";
import { buildMeetingFoodsPayload, type MeetingFoodsI18n } from "@/meetingSetup/meetingSetup";
import { useMeetingSetupStore } from "@/stores/useMeetingSetupStore";

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

  // Imperative handoff points (Phase 3 wires these)
  buildSelectedTopic: () => Topic;
  confirmTopic: (topic: Topic) => void;
  startMeeting: (foods: Food[]) => void | Promise<void>;

  meetingStep: "topic" | "foods";
  voiceGuideLanguage: string;
  meetingFoodsLabels: MeetingFoodsI18n;
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
      name: "highlight_topic",
      description: "Highlight or hover a topic on the screen (e.g. while explaining it). Pass null or empty string to clear the highlight.",
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
      name: "highlight_food",
      description: "Highlight or hover a food character on the screen (e.g. while explaining it). Pass null or empty string to clear the highlight.",
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
    {
      type: "function",
      name: "start_meeting",
      description:
        "Start the council meeting with the current selections. Same as the Start button on the foods step. " +
        "Requires the same validation: topic already confirmed, enough foods selected, unique names, and any human panelists filled in.",
      parameters: { type: "object", additionalProperties: false },
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
      useMeetingSetupStore.getState().setSelectedTopic(topicId);
      return { ok: true };
    },
    highlight_topic: (raw) => {
      const obj = asObject(raw);
      const topicId = asString(obj?.topicId);
      if (!topicId) {
        useMeetingSetupStore.getState().setHoveredTopic(null);
        return { ok: true };
      }
      if (!ctx.topics.some((t) => t.id === topicId) && topicId !== "customtopic") {
        return { ok: false, error: `Unknown topicId: ${topicId}` };
      }
      useMeetingSetupStore.getState().setHoveredTopic(topicId);
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
    confirm_topic: () => {
      const { selectedTopic } = useMeetingSetupStore.getState();
      if (!selectedTopic) return { ok: false, error: "No topic selected" };
      const topic = ctx.buildSelectedTopic();
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
      const success = useMeetingSetupStore.getState().handleSelectFoodId(foodId);
      if (!success) {
        return { ok: false, error: "Maximum number of characters (6 plus the chair) already selected." };
      }
      return { ok: true };
    },
    highlight_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) {
        useMeetingSetupStore.getState().setHoveredFood(null);
        return { ok: true };
      }
      if (!ctx.foods.some((f) => f.id === foodId) && !foodId.startsWith("panelist") && foodId !== "addhuman") {
        return { ok: false, error: `Unknown foodId: ${foodId}` };
      }
      useMeetingSetupStore.getState().setHoveredFood(foodId);
      return { ok: true };
    },
    deselect_food: (raw) => {
      const obj = asObject(raw);
      const foodId = asString(obj?.foodId);
      if (!foodId) return { ok: false, error: "Missing foodId" };
      useMeetingSetupStore.getState().handleDeselectFoodId(foodId);
      return { ok: true };
    },
    start_meeting: async () => {
      if (ctx.meetingStep !== "foods") {
        return {
          ok: false,
          error: "Confirm the topic first; start_meeting only works on the foods step after confirm_topic.",
        };
      }
      const { selectedFoods, humans, numberOfHumans } = useMeetingSetupStore.getState();
      const built = buildMeetingFoodsPayload({
        language: ctx.voiceGuideLanguage,
        selectedFoods,
        humans,
        numberOfHumans,
        labels: ctx.meetingFoodsLabels,
      });
      if (!built.ok) return built;
      await Promise.resolve(ctx.startMeeting(built.foods));
      return { ok: true, data: { started: true } };
    },
  };
}

