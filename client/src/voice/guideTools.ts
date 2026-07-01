import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import {
  buildMeetingCharactersPayload,
  orderSelectedCharactersForMuseum,
  type MeetingCharactersI18n,
} from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { getAppMode, type AgentMode } from "@/settings/councilSettings";
import { capitalizeFirstLetter } from "@/utils";
import type { GuideTopic, GuideCharacter } from "./guidePrompt";

export type { GuideTopic, GuideCharacter };

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

export function createGuideTools({
  otherLanguages,
  topics,
  characters,
  agentMode,
  isWebMode = false,
}: {
  otherLanguages: string[];
  topics: GuideTopic[];
  characters: GuideCharacter[];
  agentMode: AgentMode;
  isWebMode?: boolean;
}): RealtimeTool[] {
  const topicTitles = topics.map((t) => t.title);
  const characterNames = characters
    .filter((c) => !c.id.startsWith("panelist") && c.id !== "addhuman")
    .map((c) => c.name);

  const tools: RealtimeTool[] = [
    {
      type: "function",
      name: "begin_setup",
      description:
        `Leave the welcome screen and open the topic selection step. Call this tool immidiately when the user is ready.`,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "select_topic",
      description:
        "Highlight a topic in the UI by title and return its description so you can explain it to the visitor. Does NOT advance to food selection — call confirm_topic when the visitor is ready to proceed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string", enum: topicTitles } },
        required: ["title"],
      },
    },
    {
      type: "function",
      name: "confirm_topic",
      description:
        "Confirm the currently highlighted topic and advance to the food selection step. Returns an error if no topic is selected yet — ask the visitor to pick one first.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "set_custom_topic",
      description:
        "Select the custom topic option and set its text. Use when the visitor wants to discuss something not in the list.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
    {
      type: "function",
      name: "current_topic",
      description:
        "Return the currently selected topic title, or none if nothing is selected yet. Use to check state when unsure.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "go_to_topic_step",
      description: "Go back to the topic step so the visitor can review or change the topic selection.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "select_character",
      description:
        "Select a food character by name: adds them to the council and highlights them on the screen. Returns their name and description so you can introduce them. Call once per character; multiple characters can be selected.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string", enum: characterNames } },
        required: ["name"],
      },
    },
    {
      type: "function",
      name: "deselect_character",
      description: "Remove a food character from the selection by name.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string", enum: characterNames } },
        required: ["name"],
      },
    },
    {
      type: "function",
      name: "current_characters",
      description:
        "Return the names of currently selected food characters and human panelists. Use to check state when unsure or when there is conflicting information.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "remember_visitor_name",
      description:
        "Store the visitor's name when they tell you what to call them. Use this after a casual name question, not as a formal signup step.",
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
      description:
        "Start the council meeting with the current selections. Requires the visitor's name to be stored via remember_visitor_name first, plus the same validation as the Start button: topic confirmed, enough foods selected, unique names, and any human panelists filled in.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];

  if (isWebMode) {
    tools.push({
      type: "function",
      name: "human_panelist",
      description:
        "Add a human panelist to the council (up to 3). Use when the visitor wants to include themselves or another person. Provide their name and a short character description.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "description"],
      },
    });
  }

  if (otherLanguages.length > 0) {
    tools.push({
      type: "function",
      name: "switch_language",
      description: "Switch the conversation to a different language.",
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
        return { ok: true, data: { alreadyOnSetup: true, currentStep: ctx.meetingStep } };
      }
      ctx.beginSetup();
      return { ok: true, data: { step: "topic" } };
    },

    select_topic: (raw) => {
      const obj = asObject(raw);
      const title = asString(obj?.title);
      if (!title) return { ok: false, error: "Missing title" };
      const found = ctx.topics.find((t) => t.title === title);
      if (!found) return { ok: false, error: `Unknown topic: ${title}` };
      if (ctx.meetingStep === "landing") ctx.beginSetup();
      useMeetingSetupStore.getState().setSelectedTopic(found.id);
      return { ok: true, data: { title: found.title, description: found.description } };
    },

    confirm_topic: () => {
      const store = useMeetingSetupStore.getState();
      const topicId = store.selectedTopic;
      if (!topicId) {
        return { ok: false, error: "No topic is selected yet. Ask the visitor to pick a topic first." };
      }
      if (topicId === "customtopic" && !store.customTopic.trim()) {
        return {
          ok: false,
          error: "The custom topic text is not set yet. Ask the visitor what they want to discuss, then call set_custom_topic.",
        };
      }
      const topic = ctx.buildSelectedTopic();
      ctx.selectTopic(topic);
      return { ok: true, data: { title: topic.title } };
    },

    set_custom_topic: (raw) => {
      const obj = asObject(raw);
      const text = asString(obj?.text);
      if (!text) return { ok: false, error: "Missing text" };
      if (ctx.meetingStep === "landing") ctx.beginSetup();
      useMeetingSetupStore.getState().setSelectedTopic("customtopic");
      useMeetingSetupStore.getState().setCustomTopic(text);
      return { ok: true, data: { text } };
    },

    current_topic: () => {
      const store = useMeetingSetupStore.getState();
      const topicId = store.selectedTopic;
      if (!topicId) return { ok: true, data: { selected: null } };
      if (topicId === "customtopic") {
        return { ok: true, data: { selected: store.customTopic || null, isCustom: true } };
      }
      const found = ctx.topics.find((t) => t.id === topicId);
      return { ok: true, data: { selected: found?.title ?? topicId } };
    },

    go_to_topic_step: () => {
      if (ctx.meetingStep === "landing") {
        ctx.beginSetup();
        return { ok: true };
      }
      ctx.goToTopicStep();
      return { ok: true };
    },

    select_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) return characterStepRequiredError();
      const obj = asObject(raw);
      const name = asString(obj?.name);
      if (!name) return { ok: false, error: "Missing name" };
      const found = ctx.characters.find((c) => c.name === name);
      if (!found) return { ok: false, error: `Unknown character: ${name}` };
      const success = useMeetingSetupStore.getState().handleSelectCharacterId(found.id);
      if (!success) {
        return { ok: false, error: "Maximum number of characters (6 plus the chair) already selected." };
      }
      useMeetingSetupStore.getState().setHoveredCharacter(found.id);
      syncMuseumPanelistOrder();
      return { ok: true, data: { name: found.name, description: found.description } };
    },

    deselect_character: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) return characterStepRequiredError();
      const obj = asObject(raw);
      const name = asString(obj?.name);
      if (!name) return { ok: false, error: "Missing name" };
      const found = ctx.characters.find((c) => c.name === name);
      if (!found) return { ok: false, error: `Unknown character: ${name}` };
      useMeetingSetupStore.getState().handleDeselectCharacterId(found.id);
      useMeetingSetupStore.getState().setHoveredCharacter(null);
      syncMuseumPanelistOrder();
      return { ok: true, data: { name: found.name } };
    },

    current_characters: () => {
      const store = useMeetingSetupStore.getState();
      const foodCharIds = new Set(
        ctx.characters
          .filter((c) => !c.id.startsWith("panelist") && c.id !== "addhuman")
          .map((c) => c.id),
      );
      const foods = store.selectedCharacters
        .filter((id) => foodCharIds.has(id))
        .map((id) => ctx.characters.find((c) => c.id === id)!.name);
      const humans = store.humans
        .slice(0, store.numberOfHumans)
        .map((h) => h.name)
        .filter(Boolean);
      return { ok: true, data: { foods, humans } };
    },

    human_panelist: (raw) => {
      if (!requiresCharacterStep(ctx.meetingStep)) return characterStepRequiredError();
      const obj = asObject(raw);
      const name = normalizeVisitorName(asString(obj?.name) ?? "");
      const description = asString(obj?.description) ?? "";
      if (!name) return { ok: false, error: "Missing name" };
      if (!description) return { ok: false, error: "Missing description" };
      const store = useMeetingSetupStore.getState();
      const maxPanelists = 3;
      if (store.numberOfHumans >= maxPanelists) {
        return { ok: false, error: `Maximum of ${maxPanelists} human panelists already added.` };
      }
      const index = store.numberOfHumans;
      store.setHumans((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], name, description };
        return next;
      });
      store.setNumberOfHumans(index + 1);
      if (!store.selectedCharacters.includes(`panelist${index}`)) {
        store.handleSelectCharacterId(`panelist${index}`);
      }
      syncMuseumPanelistOrder();
      return { ok: true, data: { index, name } };
    },

    start_meeting: async () => {
      if (!requiresCharacterStep(ctx.meetingStep)) {
        return {
          ok: false,
          error: "Choose a topic first; start_meeting only works on the character selection step after confirm_topic.",
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
