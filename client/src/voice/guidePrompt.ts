import type { Topic, Character } from "@shared/ModelTypes";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import type { AgentMode } from "@/settings/councilSettings";

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
  /** Spoken display names for each language code, e.g. { en: "English", sv: "Swedish" }. Only present on multi-language bundles. */
  languageNames?: Record<string, string>;
};

/** Shared prompt skeleton; per-app JSON only supplies vocabulary and prose. */
export const VOICE_GUIDE_PROMPT_TEMPLATE =
  "${system}\n\nProject:\n${projectDescription}\n\n${visitorContext}\n\nCurrent UI step:\n${currentStep}\n\nYour job:\n${jobInstructions}\n\nAvailable topic ids:\n${topicsList}\n\nAvailable ${characterPlural} (id + name):\n${charactersList}";

export type BuildGuidePromptParams = {
  bundle: VoiceGuidePromptBundle;
  topics: GuideTopic[];
  characters: GuideCharacter[];
  phase: MeetingSetupPhase;
  agentMode?: AgentMode;
  visitorName?: string;
  /** Spoken names of other available languages, e.g. ["Swedish"]. Empty or absent on single-language deploys. */
  otherLanguageNames?: string[];
};

function formatBullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

function buildVisitorContext(visitorName: string | undefined): string {
  const trimmed = visitorName?.trim() ?? "";
  if (trimmed.length > 0) {
    return `Visitor name:\nYou already know this visitor as ${trimmed}. Use their name naturally; do not ask again unless they correct you.`;
  }
  return "Visitor name:\nYou do not know the visitor's name yet. Learn it casually during the conversation and call remember_visitor_name when they tell you. You must store their name before calling start_meeting; that tool will fail without it.";
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
  const { bundle, topics, characters, phase, agentMode = "always-on", visitorName, otherLanguageNames } = params;

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
      ? (agentMode === "ptt" ? bundle.landingJobInstructionsPushToTalk : bundle.landingJobInstructions)
      : bundle.jobInstructions;
  const replacements: Record<string, string> = {
    system: bundle.system.trim(),
    projectDescription: bundle.projectDescription.trim(),
    visitorContext: buildVisitorContext(visitorName),
    currentStep: phaseLabel,
    jobInstructions: formatBullets(jobLines),
    topicsList: formatBullets(topicsList),
    charactersList: formatBullets(charactersList),
    characterSingular,
    characterPlural,
    characterStepLabel,
  };

  let prompt = VOICE_GUIDE_PROMPT_TEMPLATE.replace(/\$\{(\w+)\}/g, (_match, key: string) => replacements[key] ?? "");

  if (phase === "landing" && otherLanguageNames && otherLanguageNames.length > 0) {
    const names = otherLanguageNames.join(" or ");
    prompt += `\n\nLanguage options:\nIn your opening welcome, mention once — as a brief aside, not a question you wait for — that the visitor can continue in ${names} if they prefer (e.g. "If you prefer ${names}, let me know."). Then continue immediately with your main job. Do not pause for an answer. If they later ask to switch, call switch_language with the target language code.`;
  }

  return prompt;
}
