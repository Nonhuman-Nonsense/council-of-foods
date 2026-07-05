import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import type { AgentMode } from "@/settings/councilSettings";
import { buildEnPrompt } from "./guidePromptEn";

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideCharacter = Pick<Character, "id" | "name"> & { description?: string };

export type GuidePromptParams = {
  topics: GuideTopic[];
  characters: GuideCharacter[];
  phase: MeetingSetupPhase;
  agentMode?: AgentMode;
  visitorName?: string;
  otherLanguageNames?: string[];
};

/** Add an entry here when adding a new language prompt file. */
const builders: Record<string, (params: GuidePromptParams) => string> = {
  en: buildEnPrompt,
};

export function buildGuidePrompt(params: GuidePromptParams & { language: string }): string {
  const { language, ...rest } = params;
  return (builders[language] ?? buildEnPrompt)(rest);
}
