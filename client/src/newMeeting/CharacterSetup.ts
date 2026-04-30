import {
  AVAILABLE_VOICES,
  type Character,
  type CharacterSetupData,
  type VoiceOption,
} from "@shared/ModelTypes";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { globalClientOptions } from "@/globalClientOptions";
import {
  CHARACTERS_FILE,
  characterSetupBundleModules,
  defaultCharacterSetupBundle,
} from "@/prompts/characterSetupBundles";
export type { Character, CharacterSetupData } from "@shared/ModelTypes";

const localCharacterSetupData: Record<string, CharacterSetupData> = {};

// We assume that the files exist, since we validate them in the tests.
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = Object.keys(characterSetupBundleModules).find((path) =>
    path.endsWith(`${CHARACTERS_FILE}_${lang}.json`)
  );
  if (moduleKey) {
    localCharacterSetupData[lang] = characterSetupBundleModules[moduleKey];
  }
}

Object.freeze(localCharacterSetupData);
for (const language in localCharacterSetupData) {
  for (let i = 0; i < localCharacterSetupData[language].characters.length; i++) {
    Object.freeze(localCharacterSetupData[language].characters[i]);
  }
}

function requireCharacterSetupData(language: string): CharacterSetupData {
  const data =
    localCharacterSetupData[language] ?? localCharacterSetupData[AVAILABLE_LANGUAGES[0]];
  if (!data) {
    throw new Error(
      `Missing character prompt bundle. language=${language}, fallback=${AVAILABLE_LANGUAGES[0]}`
    );
  }
  return data;
}

/** Frozen character-selection data + chair/system prompts for one UI language. */
export function getCharacterSetupBundle(lang: string): CharacterSetupData {
  return requireCharacterSetupData(lang);
}

// Infer the default voice from the configuration to ensure blankHuman is valid.
const defaultChair =
  (localCharacterSetupData[AVAILABLE_LANGUAGES[0]] ?? defaultCharacterSetupBundle).characters.find(
    (character) => character.id === globalClientOptions.chairId
  );
const defaultVoice: VoiceOption = (defaultChair?.voice as VoiceOption | undefined) ?? AVAILABLE_VOICES[0];

const blankHuman: Character = {
  id: "",
  name: "",
  description: "",
  prompt: "",
  voice: defaultVoice,
  voiceProvider: defaultChair?.voiceProvider,
  voiceTemperature: defaultChair?.voiceTemperature,
  voiceInstruction: defaultChair?.voiceInstruction,
  voiceLocale: defaultChair?.voiceLocale,
  size: 1.0,
};

export function createHuman(index: number): Character {
  const newHuman = structuredClone(blankHuman);
  newHuman.id = "panelist" + index;
  return newHuman;
}

export function createDefaultHumans(): Character[] {
  return [createHuman(0), createHuman(1), createHuman(2)];
}
