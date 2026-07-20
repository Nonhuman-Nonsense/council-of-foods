import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import type { Character, Topic } from "@shared/ModelTypes";
import { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata";
import type { CouncilState } from "@council/hooks/useCouncilMachine";
import type { ParticipationPhase } from "@council/humanInput/participationPhase";
import type { AgentMode } from "@/settings/councilSettings";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";

export type CouncilVocabulary = {
  singular: string;
  plural: string;
  councilName: string;
};

export type MetaAgentPromptBundle = {
  chairIdentity: string;
  chairVoice: string;
  projectDescription: string;
  councilVocabulary: CouncilVocabulary;
  jobInstructions: string[];
  toolDescriptions: Record<"resume_meeting" | "restart_meeting", string>;
  /** Example interruption greeting — agent should match tone, not repeat verbatim. */
  activationGreetingExample: string;
  extensionJobInstructions: string[];
  extensionToolDescriptions: Record<"extend_meeting" | "conclude_meeting", string>;
  /** Example soft-cap greeting — agent should match tone, not repeat verbatim. */
  extensionActivationGreetingExample: string;
};

const META_AGENT_TOOL_ORDER = ["resume_meeting", "restart_meeting"] as const;
const EXTENSION_TOOL_ORDER = ["extend_meeting", "conclude_meeting"] as const;

export type MetaAgentStateSnapshot = {
  councilState: CouncilState;
  topic: Topic | null;
  participants: Character[];
  currentSpeakerName: string;
  humanName: string;
  participationPhase: ParticipationPhase;
};

const metaAgentModules = import.meta.glob<MetaAgentPromptBundle>(
  "@shared/prompts/meta_agent_*.json",
  { eager: true, import: "default" },
);

function resolveMetaAgentModulePath(lang: string): string | undefined {
  const suffix = `meta_agent_${CHARACTERS_FILE}_${lang}.json`;
  return Object.keys(metaAgentModules).find((path) => path.endsWith(suffix));
}

const metaAgentByLanguage: Partial<Record<string, MetaAgentPromptBundle>> = {};
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = resolveMetaAgentModulePath(lang);
  if (moduleKey) {
    metaAgentByLanguage[lang] = metaAgentModules[moduleKey];
  }
}

const fallbackLanguage = AVAILABLE_LANGUAGES[0];
if (!metaAgentByLanguage[fallbackLanguage]) {
  const available = Object.keys(metaAgentByLanguage).sort().join(", ") || "(none)";
  throw new Error(
    `[metaAgentPrompt] Missing meta-agent bundle for ${CHARACTERS_FILE}/${fallbackLanguage}. ` +
      `Available: ${available}. Expected shared/prompts/meta_agent_${CHARACTERS_FILE}_*.json`,
  );
}

/** Frozen meta-agent copy for one UI language (meeting interruption chair). */
export function getMetaAgentBundle(lang: string): MetaAgentPromptBundle {
  const normalized = (AVAILABLE_LANGUAGES as readonly string[]).includes(lang)
    ? lang
    : lang.toLowerCase().startsWith("sv")
      ? "sv"
      : fallbackLanguage;
  return metaAgentByLanguage[normalized] ?? metaAgentByLanguage[fallbackLanguage]!;
}

/** Shared prompt skeleton; per-app JSON supplies chair identity and vocabulary. */
export const META_AGENT_PROMPT_TEMPLATE =
  "${chairIdentity}\n${chairVoice}\n\nProject:\n${projectDescription}\n\nYour role:\n${roleDescription}\n\nYour job:\n${jobInstructions}\n\nTools:\n${toolsList}\n\nRules:\n${rulesList}";

function formatBullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function buildToolsList(
  toolOrder: readonly string[],
  toolDescriptions: Record<string, string>,
): string {
  return formatBullets(toolOrder.map((name) => `${name}: ${toolDescriptions[name]}`));
}

function buildInterruptionToolsList(toolDescriptions: MetaAgentPromptBundle["toolDescriptions"]): string {
  return buildToolsList(META_AGENT_TOOL_ORDER, toolDescriptions);
}

function buildExtensionToolsList(
  toolDescriptions: MetaAgentPromptBundle["extensionToolDescriptions"],
): string {
  return buildToolsList(EXTENSION_TOOL_ORDER, toolDescriptions);
}

function buildPttRule(agentMode: AgentMode): string {
  if (agentMode !== "ptt") return "";
  return "The visitor uses a physical talk button: hold to talk, release to send.";
}

function truncateDescription(text: string, maxLen = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function isPanelistId(id: string): boolean {
  return id.startsWith("panelist");
}

function partitionParticipants(participants: Character[]) {
  const humanPanelists = participants.filter((p) => isPanelistId(p.id));
  const councilMembers = participants.filter(
    (p) => !isPanelistId(p.id) && p.id !== CHAIR_ID,
  );
  return { humanPanelists, councilMembers };
}

/**
 * Builds the system prompt for the meta-agent.
 *
 * Keep it short — long prompts cause provider errors. Live meeting context
 * (topic, participants, visitor name) arrives via STATE SYNC on activation.
 */
export function buildMetaAgentPrompt(params: {
  bundle: MetaAgentPromptBundle;
  agentMode?: AgentMode;
}): string {
  const { bundle, agentMode = "ptt" } = params;
  const { councilName, plural } = bundle.councilVocabulary;

  const roleDescription =
    `During ${councilName}, the talk button stays on. When pressed, the council pauses and you — ` +
    `the chair — address the interruption. You are not a kiosk helper or setup guide.`;

  const rules = [
    "Stay quiet until you receive (STATE SYNC: ...) — then respond.",
    "If the visitor has not spoken yet, open by acknowledging the interruption — they paused the council; they will be invited to speak when it is their turn; they may restart if they wish. About 2–3 short sentences.",
    `Example tone (vary the words each time — do not repeat verbatim): "${bundle.activationGreetingExample.trim()}"`,
    "Do not open with 'How can I help you?' or other generic guide phrases.",
    "You decide when the interruption is over — short replies like 'ok' or no further question after your answer are enough. Then call resume_meeting in that same turn.",
    "Do not end a turn with only a spoken goodbye or farewell; always call resume_meeting to resume the council.",
    "Be concise. Visitors stand at a kiosk. Do not reference on-screen UI.",
    buildPttRule(agentMode),
    "Use the visitor's name from STATE SYNC when you know it.",
  ].filter(Boolean);

  const replacements: Record<string, string> = {
    chairIdentity: bundle.chairIdentity.trim(),
    chairVoice: bundle.chairVoice.trim(),
    projectDescription: bundle.projectDescription.trim(),
    roleDescription,
    jobInstructions: formatBullets(bundle.jobInstructions),
    toolsList: buildInterruptionToolsList(bundle.toolDescriptions),
    rulesList: formatBullets(rules),
    councilName,
    characterPlural: plural,
  };

  return META_AGENT_PROMPT_TEMPLATE.replace(
    /\$\{(\w+)\}/g,
    (_match, key: string) => replacements[key] ?? "",
  );
}

/**
 * Synthetic user turn sent after STATE SYNC to trigger the activation greeting.
 * Mirrors the setup-agent opening-greeting pattern (user item + response.create).
 */
export function buildMetaAgentActivationTurn(): string {
  return (
    "The visitor just interrupted the council meeting. " +
    "Give your interruption greeting now — acknowledge the pause, not a generic welcome. " +
    "Use the STATE SYNC context above."
  );
}

/**
 * One-shot snapshot injected into the conversation when the visitor first
 * presses the button (standby → active).
 */
export function buildMetaAgentStateSnapshot(snapshot: MetaAgentStateSnapshot): string {
  const { humanPanelists, councilMembers } = partitionParticipants(snapshot.participants);
  const visitorName = snapshot.humanName.trim() || null;

  const payload = {
    source: "system",
    type: "meta_agent_activate",
    councilState: snapshot.councilState,
    topic: snapshot.topic
      ? {
          id: snapshot.topic.id,
          title: snapshot.topic.title,
          description: truncateDescription(snapshot.topic.description),
        }
      : null,
    councilMembers: councilMembers.map((p) => p.name),
    humanPanelists: humanPanelists.map((p) => ({
      name: p.name,
      description: p.description ? truncateDescription(p.description, 200) : null,
    })),
    currentSpeaker: snapshot.currentSpeakerName || null,
    visitorName,
    participationPhase: snapshot.participationPhase,
  };

  return `(STATE SYNC: ${JSON.stringify(payload)})`;
}

/**
 * System prompt for the soft-cap extension phase — chair asks extend vs conclude.
 */
export function buildExtensionAgentPrompt(params: {
  bundle: MetaAgentPromptBundle;
  agentMode?: AgentMode;
}): string {
  const { bundle, agentMode = "ptt" } = params;
  const { councilName } = bundle.councilVocabulary;

  const roleDescription =
    `The ${councilName} has reached its planned length. You — the chair — ask the visitor ` +
    `whether to extend the discussion or bring the meeting to a conclusion.`;

  const rules = [
    "Stay quiet until you receive (STATE SYNC: ...) — then respond.",
    "Open by explaining that the meeting is getting long, then ask extend or conclude — about 2–3 short sentences.",
    `Example tone (vary the words each time — do not repeat verbatim): "${bundle.extensionActivationGreetingExample.trim()}"`,
    "Listen if the visitor speaks; you judge when their preference is clear.",
    "You must call exactly one tool — extend_meeting or conclude_meeting — before ending your turn.",
    "Do not end a turn with only a spoken preference; always call the matching tool in that same turn.",
    "Be concise. Visitors stand at a kiosk. Do not reference on-screen UI.",
    buildPttRule(agentMode),
    "Use the visitor's name from STATE SYNC when you know it.",
  ].filter(Boolean);

  const replacements: Record<string, string> = {
    chairIdentity: bundle.chairIdentity.trim(),
    chairVoice: bundle.chairVoice.trim(),
    projectDescription: bundle.projectDescription.trim(),
    roleDescription,
    jobInstructions: formatBullets(bundle.extensionJobInstructions),
    toolsList: buildExtensionToolsList(bundle.extensionToolDescriptions),
    rulesList: formatBullets(rules),
    councilName,
    characterPlural: bundle.councilVocabulary.plural,
  };

  return META_AGENT_PROMPT_TEMPLATE.replace(
    /\$\{(\w+)\}/g,
    (_match, key: string) => replacements[key] ?? "",
  );
}

/** Synthetic user turn after extension STATE SYNC — chair speaks first (no PTT). */
export function buildExtensionActivationTurn(): string {
  return (
    "The meeting has reached its planned length. " +
    "Explain briefly and ask whether to extend or conclude. " +
    "Use the STATE SYNC context above. Speak now as the chair."
  );
}

/**
 * Snapshot for soft-cap extension — council is paused at query_extension.
 */
export function buildExtensionStateSnapshot(snapshot: MetaAgentStateSnapshot): string {
  const { humanPanelists, councilMembers } = partitionParticipants(snapshot.participants);
  const visitorName = snapshot.humanName.trim() || null;

  const payload = {
    source: "system",
    type: "meta_agent_extension",
    councilState: "query_extension",
    topic: snapshot.topic
      ? {
          id: snapshot.topic.id,
          title: snapshot.topic.title,
          description: truncateDescription(snapshot.topic.description),
        }
      : null,
    councilMembers: councilMembers.map((p) => p.name),
    humanPanelists: humanPanelists.map((p) => ({
      name: p.name,
      description: p.description ? truncateDescription(p.description, 200) : null,
    })),
    currentSpeaker: snapshot.currentSpeakerName || null,
    visitorName,
    participationPhase: snapshot.participationPhase,
  };

  return `(STATE SYNC: ${JSON.stringify(payload)})`;
}
