import { Character, VoiceOption, AVAILABLE_VOICES } from "@shared/ModelTypes";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { globalClientOptions } from "@/globalClientOptions";
import {
  CHARACTERS_FILE,
  characterSetupBundleModules,
  defaultCharacterSetupBundle,
} from "@/prompts/characterSetupBundles";

export interface MeetingCharacter extends Partial<Character> {
  id: string;
  name: string;
  description: string;
  prompt?: string;
  type?: 'panelist' | 'food' | 'chair' | string;
  index?: number;
  voice: VoiceOption;
  voiceProvider?: 'openai' | 'gemini';
  voiceLocale?: string;
  size?: number;
  voiceInstruction?: string;
}

export interface CharacterSetupData {
  metadata: {
    version: string;
    last_updated: string;
  };
  panelWithHumans: string;
  addHuman: {
    id: string;
    name: string;
    description: string;
  };
  characters: MeetingCharacter[];
}

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
const defaultVoice: VoiceOption = defaultChair?.voice || AVAILABLE_VOICES[0];

const blankHuman: MeetingCharacter = {
  id: "",
  type: "panelist",
  name: "",
  description: "",
  voice: defaultVoice,
  voiceProvider: defaultChair?.voiceProvider,
  voiceTemperature: defaultChair?.voiceTemperature,
  voiceInstruction: defaultChair?.voiceInstruction,
  voiceLocale: defaultChair?.voiceLocale,
  size: 1.0,
};

export function createHuman(index: number): MeetingCharacter {
  const newHuman = structuredClone(blankHuman);
  newHuman.id = "panelist" + index;
  newHuman.index = index;
  return newHuman;
}

export function createDefaultHumans(): MeetingCharacter[] {
  return [createHuman(0), createHuman(1), createHuman(2)];
}
