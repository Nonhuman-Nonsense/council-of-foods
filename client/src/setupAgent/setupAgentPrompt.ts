import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import { buildEnPrompt } from "./setupAgentPromptEn";

export type SetupAgentTopic = Pick<Topic, "id" | "title" | "description">;
export type SetupAgentCharacter = Pick<Character, "id" | "name"> & { description?: string };

export type SetupAgentPromptParams = {
  topics: SetupAgentTopic[];
  characters: SetupAgentCharacter[];
  phase: MeetingSetupPhase;
  visitorName?: string;
  otherLanguageNames?: string[];
  /**
   * Whether the visitor has had a working microphone at all this session. While
   * false the conversational job is suspended: the agent comments on what is
   * being clicked instead, and its tools refuse to act. Defaults to true so
   * museum (mic always present) is unaffected.
   */
  hasEverHeardVisitor?: boolean;
};

/** Add an entry here when adding a new language prompt file. */
const builders: Record<string, (params: SetupAgentPromptParams) => string> = {
  en: buildEnPrompt,
};

export function buildSetupAgentPrompt(params: SetupAgentPromptParams & { language: string }): string {
  const { language, ...rest } = params;
  return (builders[language] ?? buildEnPrompt)(rest);
}
