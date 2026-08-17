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
   * Whether the visitor's microphone is live right now. False on web until they
   * press the mic button, which suspends the conversational job: the agent
   * comments on what is being clicked instead. Defaults to true so museum
   * (mic always present) is unaffected.
   */
  canHearVisitor?: boolean;
  /**
   * Whether the visitor has spoken at all this session. Only decides whether to
   * invite them to use the microphone — pointless once they already have.
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
