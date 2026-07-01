import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata";
import type { VoiceGuidePromptBundle } from "./guidePrompt";

const voiceGuideModules = import.meta.glob<VoiceGuidePromptBundle>(
  "@shared/prompts/voice_guide_*.json",
  { eager: true, import: "default" },
);

function resolveModulePath(lang: string): string | undefined {
  const suffix = `voice_guide_${CHARACTERS_FILE}_${lang}.json`;
  return Object.keys(voiceGuideModules).find((path) => path.endsWith(suffix));
}

const voiceGuideByLanguage: Partial<Record<string, VoiceGuidePromptBundle>> = {};
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = resolveModulePath(lang);
  if (moduleKey) {
    voiceGuideByLanguage[lang] = voiceGuideModules[moduleKey];
  }
}

const fallbackLanguage = AVAILABLE_LANGUAGES[0];
if (!voiceGuideByLanguage[fallbackLanguage]) {
  const available = Object.keys(voiceGuideByLanguage).sort().join(", ") || "(none)";
  throw new Error(
    `[voiceGuideBundle] Missing voice guide bundle for ${CHARACTERS_FILE}/${fallbackLanguage}. ` +
      `Available: ${available}. Expected shared/prompts/voice_guide_${CHARACTERS_FILE}_*.json`,
  );
}

/** Frozen voice-guide copy for one UI language (wizard kiosk agent). */
export function getVoiceGuideBundle(lang: string): VoiceGuidePromptBundle {
  const normalized = (AVAILABLE_LANGUAGES as readonly string[]).includes(lang)
    ? lang
    : lang.toLowerCase().startsWith("sv")
      ? "sv"
      : fallbackLanguage;
  return voiceGuideByLanguage[normalized] ?? voiceGuideByLanguage[fallbackLanguage]!;
}
