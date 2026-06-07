import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";

export type GuideTopic = Pick<Topic, "id" | "title" | "description">;
export type GuideCharacter = Pick<Character, "id" | "name"> & { description?: string };

export type VoiceGuidePromptBundle = {
  system: string;
  projectDescription: string;
  promptTemplate: string;
  landingJobInstructions: string[];
  landingJobInstructionsPushToTalk: string[];
  jobInstructions: string[];
  toolDescriptions: Record<string, string>;
};

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
 * The prompt is intentionally short. We DO NOT inline topic/food descriptions
 * here; the model gets only id+title/name lists and is told to call the
 * `describe_topic` / `describe_food` tools when it needs detail. This keeps
 * the prompt under Inworld's tolerance and avoids the `server_error` failures
 * we hit with very long instructions.
 */
export function buildGuidePrompt(params: BuildGuidePromptParams): string {
  const { bundle, topics, characters, phase, pushToTalkMode = false } = params;

  const topicsList = topics.map((t) => `${t.id}: ${t.title}`);
  const charactersList = characters.map((character) => `${character.id}: ${character.name}`);
  const phaseLabel = phase === "landing" ? "welcome landing" : phase;
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
    foodsList: formatBullets(charactersList),
  };

  return bundle.promptTemplate.replace(/\$\{(\w+)\}/g, (_match, key: string) => replacements[key] ?? "");
}
