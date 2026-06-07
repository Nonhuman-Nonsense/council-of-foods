import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideCharacter = Pick<Character, "id" | "name"> & { description?: string };

/** Domain terms shown to the voice agent (e.g. foods vs forest beings). Shared code stays "character". */
export type CharacterVocabulary = {
  singular: string;
  plural: string;
  stepLabel: string;
};

export type VoiceGuidePromptBundle = {
  system: string;
  projectDescription: string;
  /** Agent-facing names for council participants; internal phase and tools stay "character". */
  characterVocabulary: CharacterVocabulary;
  landingJobInstructions: string[];
  landingJobInstructionsPushToTalk: string[];
  jobInstructions: string[];
  toolDescriptions: Record<string, string>;
};

/** Shared prompt skeleton; per-app JSON only supplies vocabulary and prose. */
export const VOICE_GUIDE_PROMPT_TEMPLATE =
  "${system}\n\nProject:\n${projectDescription}\n\nCurrent UI step:\n${currentStep}\n\nYour job:\n${jobInstructions}\n\nAvailable topic ids:\n${topicsList}\n\nAvailable ${characterPlural} (id + name):\n${charactersList}";

export type BuildGuidePromptParams = {
  bundle: VoiceGuidePromptBundle;
  topics: GuideTopic[];
  characters: GuideCharacter[];
  phase: MeetingSetupPhase;
  pushToTalkMode?: boolean;
};

function formatBullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/**
 * Builds the system prompt for the voice guide.
 *
 * The prompt is intentionally short. We DO NOT inline topic/character descriptions
 * here; the model gets only id+title/name lists and is told to call the
 * `describe_topic` / character tools when it needs detail. This keeps
 * the prompt under Inworld's tolerance and avoids the `server_error` failures
 * we hit with very long instructions.
 */
export function buildGuidePrompt(params: BuildGuidePromptParams): string {
  const { bundle, topics, characters, phase, pushToTalkMode = false } = params;

  const { singular: characterSingular, plural: characterPlural, stepLabel: characterStepLabel } =
    bundle.characterVocabulary;
  const topicsList = topics.map((t) => `${t.id}: ${t.title}`);
  const charactersList = characters.map((character) => `${character.id}: ${character.name}`);
  const phaseLabel =
    phase === "landing"
      ? "welcome landing"
      : phase === "characters"
        ? characterStepLabel
        : phase;
  const jobLines =
    phase === "landing"
      ? (pushToTalkMode ? bundle.landingJobInstructionsPushToTalk : bundle.landingJobInstructions)
      : bundle.jobInstructions;
  const replacements: Record<string, string> = {
    system: bundle.system.trim(),
    projectDescription: bundle.projectDescription.trim(),
    currentStep: phaseLabel,
    jobInstructions: formatBullets(jobLines),
    topicsList: formatBullets(topicsList),
    charactersList: formatBullets(charactersList),
    characterSingular,
    characterPlural,
    characterStepLabel,
  };

  return VOICE_GUIDE_PROMPT_TEMPLATE.replace(/\$\{(\w+)\}/g, (_match, key: string) => replacements[key] ?? "");
}
