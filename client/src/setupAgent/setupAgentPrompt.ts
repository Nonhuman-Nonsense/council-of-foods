import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";
import { buildEnPrompt } from "./setupAgentPromptEn";

/**
 * `agentBrief` is optional on {@link Topic} — a meeting's topic can be one the
 * visitor wrote themselves — but required here: it is what the agent speaks
 * from, and every topic it can offer has one (asserted in ValidateTopicsData).
 */
export type SetupAgentTopic = Pick<Topic, "id" | "title" | "description"> & { agentBrief: string };
export type SetupAgentCharacter = Pick<Character, "id" | "name" | "aliases"> & { description?: string };

/**
 * What is already chosen when the session starts. A session can open long
 * after the clicks that made these choices — the visitor turns the agent on
 * mid-setup, or it reconnects — and the reactions to those clicks went to an
 * earlier session or to none at all.
 */
export type SetupAgentSelection = {
  /** As the visitor sees it: a listed topic's title, or a custom topic's own text. */
  topic?: string;
  /** Council members already picked, by name — without the chair, who is the agent itself. */
  council: string[];
};

export type SetupAgentPromptParams = {
  topics: SetupAgentTopic[];
  characters: SetupAgentCharacter[];
  phase: MeetingSetupPhase;
  visitorName?: string;
  otherLanguageNames?: string[];
  selection?: SetupAgentSelection;
  /**
   * Whether the visitor has had a working microphone at all this session. While
   * false the conversational job is suspended: the agent comments on what is
   * being clicked instead, and its tools refuse to act. Defaults to true so
   * an installation (mic always present) is unaffected.
   */
  hasEverHeardVisitor?: boolean;
};

/** Add an entry here when adding a new language prompt file. */
const builders: Record<string, (params: SetupAgentPromptParams) => string> = {
  en: buildEnPrompt,
};

export function buildSetupAgentPrompt(params: SetupAgentPromptParams & { language: string }): string {
  const { language, ...rest } = params;
  // The agent speaks as the chair, who is in every meeting — not a character to offer the visitor.
  const characters = rest.characters.filter((character) => character.id !== CHAIR_ID);
  return (builders[language] ?? buildEnPrompt)({ ...rest, characters });
}
