import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import {
  buildMeetingCharactersPayload,
  orderSelectedCharactersForMuseum,
  type MeetingCharactersI18n,
} from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { getAppMode } from "@/settings/councilSettings";
import { capitalizeFirstLetter } from "@/utils";
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
  | { ok: true; data?: unknown; /** Skip response.create after this tool (e.g. meta-agent exit). */ suppressContinuation?: boolean }
  | { ok: false; error: string };

export type ToolHandler = (args: unknown) => Promise<ToolResult> | ToolResult;

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideCharacter = Pick<Character, "id" | "name"> & { description?: string };

export type GuideToolContext = {
  topics: GuideTopic[];
  characters: GuideCharacter[];

  beginSetup: () => void;
  goToTopicStep: () => void;
  buildSelectedTopic: () => Topic;
  selectTopic: (topic: Topic) => void;
  startMeeting: (characters: Character[]) => void | Promise<void>;

  meetingStep: MeetingSetupPhase;
  voiceGuideLanguage: string;
  meetingCharactersLabels: MeetingCharactersI18n;

  /** Navigate to a different language. Empty array on single-language deploys. */
  otherLanguages: string[];
  switchLanguage: (lang: string) => void;
};

function requiresCharacterStep(step: MeetingSetupPhase): boolean {
  return step === "characters";
}

function characterStepRequiredError(): ToolResult {
  return {
    ok: false,
    error: "Choose a topic first; character tools are only available on the character selection step.",
  };
}

function asObject(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object") return null;
  return args as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeVisitorName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return capitalizeFirstLetter(trimmed);
}

function participantNames(ctx: GuideToolContext): string[] {
  const store = useMeetingSetupStore.getState();
  return [
    ...ctx.characters.map((character) => character.name),
    ...store.humans.slice(0, store.numberOfHumans).map((human) => human.name),
  ].filter((name) => name.length > 0);
}

function isDuplicateParticipantName(name: string, ctx: GuideToolContext): boolean {
  const names = participantNames(ctx);
  names.push(name);
  return new Set(names).size !== names.length;
}

export function createGuideTools(params: {
  promptBundle: VoiceGuidePromptBundle;
  otherLanguages: string[];
}): RealtimeTool[] {
  const { promptBundle, otherLanguages } = params;
  const copy = promptBundle.toolDescriptions;
  const tools: RealtimeTool[] = [
    {
      type: "function",
      name: "begin_setup",
      description: copy.begin_setup,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
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
      name: "list_characters",
      description: copy.list_characters,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "describe_character",
      description: copy.describe_character,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { characterId: { type: "string" } },
        required: ["characterId"],
      },
    },
    {
      type: "function",
      name: "select_character",
      description: copy.select_character,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { characterId: { type: "string" } },
        required: ["characterId"],
      },
    },
    {
      type: "function",
      name: "highlight_character",
      description: copy.highlight_character,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { characterId: { type: "string" } },
        required: ["characterId"],
      },
    },
    {
      type: "function",
      name: "deselect_character",
      description: copy.deselect_character,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { characterId: { type: "string" } },
        required: ["characterId"],
      },
    },
    {
      type: "function",
      name: "remember_visitor_name",
      description: copy.remember_visitor_name,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      type: "function",
      name: "start_meeting",
      description: copy.start_meeting,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];

  if (otherLanguages.length > 0) {
    tools.push({
      type: "function",
      name: "switch_language",
      description: copy.switch_language,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { language: { type: "string", enum: otherLanguages } },
        required: ["language"],
      },
    });
  }

  return tools;
}

function syncMuseumPanelistOrder(): void {
  if (getAppMode() !== "museum") return;
  const store = useMeetingSetupStore.getState();
  if (!store.selectedCharacters.some((id) => id.startsWith("panelist"))) return;
  const sorted = orderSelectedCharactersForMuseum(store.selectedCharacters);
  if (sorted.join(",") !== store.selectedCharacters.join(",")) {
    store.setSelectedCharacters(sorted);
  }
}

export function createGuideToolHandlers(ctx: GuideToolContext): Record<string, ToolHandler> {
  return {
    begin_setup: () => {
      if (ctx.meetingStep !== "landing") {
        return { ok: true, data: { alreadyOnSetup: true } };
      }
      ctx.beginSetup();
      return { ok: true };
    },
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
      if (ctx.meetingStep === "landing") {
        ctx.beginSetup();
      }
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
      if (ctx.meetingStep === "landing") {
        ctx.beginSetup();
      }
      useMeetingSetupStore.getState().setSelectedTopic("customtopic");
      useMeetingSetupStore.getState().setCustomTopic(text);
      return { ok: true };
    },
    go_to_topic_step: () => {
      if (ctx.meetingStep === "landing") {
        ctx.beginSetup();
        return { ok: true };
      }
      ctx.goToTopicStep();
      return { ok: true };
    },
    list_characters: () => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return characterStepRequiredError();
      }
      return {
        ok: true,
        data: ctx.characters.map((character) => ({ id: character.id, name: character.name })),
      };
    },
    describe_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return characterStepRequiredError();
      }
      const obj = asObject(raw);
      const characterId = asString(obj?.characterId);
      if (!characterId) return { ok: false, error: "Missing characterId" };
      const found = ctx.characters.find((character) => character.id === characterId);
      if (!found) return { ok: false, error: `Unknown characterId: ${characterId}` };
      return { ok: true, data: found };
    },
    select_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return characterStepRequiredError();
      }
      const obj = asObject(raw);
      const characterId = asString(obj?.characterId);
      if (!characterId) return { ok: false, error: "Missing characterId" };
      if (!ctx.characters.some((character) => character.id === characterId) && !characterId.startsWith("panelist")) {
        return { ok: false, error: `Unknown characterId: ${characterId}` };
      }
      const success = useMeetingSetupStore.getState().handleSelectCharacterId(characterId);
      if (!success) {
        return { ok: false, error: "Maximum number of characters (6 plus the chair) already selected." };
      }
      syncMuseumPanelistOrder();
      return { ok: true };
    },
    highlight_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return characterStepRequiredError();
      }
      const obj = asObject(raw);
      const characterId = asString(obj?.characterId);
      if (!characterId) {
        useMeetingSetupStore.getState().setHoveredCharacter(null);
        return { ok: true };
      }
      if (
        !ctx.characters.some((character) => character.id === characterId) &&
        !characterId.startsWith("panelist") &&
        characterId !== "addhuman"
      ) {
        return { ok: false, error: `Unknown characterId: ${characterId}` };
      }
      useMeetingSetupStore.getState().setHoveredCharacter(characterId);
      return { ok: true };
    },
    deselect_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return characterStepRequiredError();
      }
      const obj = asObject(raw);
      const characterId = asString(obj?.characterId);
      if (!characterId) return { ok: false, error: "Missing characterId" };
      useMeetingSetupStore.getState().handleDeselectCharacterId(characterId);
      syncMuseumPanelistOrder();
      return { ok: true };
    },
    start_meeting: async () => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return {
          ok: false,
          error: "Choose a topic first; start_meeting only works on the character selection step after select_topic.",
        };
      }
      const { selectedCharacters, humans, numberOfHumans, visitorName } = useMeetingSetupStore.getState();
      if (!visitorName.trim()) {
        return {
          ok: false,
          error:
            "Learn the visitor's name first and call remember_visitor_name before start_meeting. Ask casually until they tell you.",
        };
      }
      const built = buildMeetingCharactersPayload({
        language: ctx.voiceGuideLanguage,
        selectedCharacters,
        humans,
        numberOfHumans,
        labels: ctx.meetingCharactersLabels,
        agendaPoints: ctx.buildSelectedTopic()?.agendaPoints,
        isMuseumMode: getAppMode() === "museum",
      });
      if (!built.ok) return built;
      await Promise.resolve(ctx.startMeeting(built.characters));
      return { ok: true, data: { started: true, visitorName } };
    },
    switch_language: (raw) => {
      const obj = asObject(raw);
      const lang = asString(obj?.language);
      if (!lang) return { ok: false, error: "Missing language" };
      if (!ctx.otherLanguages.includes(lang)) {
        return { ok: false, error: `Language not available: ${lang}` };
      }
      ctx.switchLanguage(lang);
      return { ok: true, suppressContinuation: true };
    },
    remember_visitor_name: (raw) => {
      const obj = asObject(raw);
      const rawName = asString(obj?.name);
      if (!rawName) return { ok: false, error: "Missing name" };
      const name = normalizeVisitorName(rawName);
      if (!name) return { ok: false, error: "Name cannot be empty." };
      if (isDuplicateParticipantName(name, ctx)) {
        return {
          ok: false,
          error: "That name is already used by a council participant. Ask for a different name.",
        };
      }
      useMeetingSetupStore.getState().setVisitorName(name);

      if (getAppMode() === "museum") {
        const store = useMeetingSetupStore.getState();
        if (store.numberOfHumans === 0) {
          store.setHumans((prev) => {
            const next = [...prev];
            if (next[0]) {
              next[0] = { ...next[0], name };
            }
            return next;
          });
          store.setNumberOfHumans(1);
          if (!store.selectedCharacters.includes("panelist0")) {
            store.handleSelectCharacterId("panelist0");
          }
          const updated = useMeetingSetupStore.getState();
          updated.setSelectedCharacters(
            orderSelectedCharactersForMuseum(updated.selectedCharacters)
          );
        } else {
          syncMuseumPanelistOrder();
        }
      }

      return { ok: true, data: { name } };
    },
  };
}
