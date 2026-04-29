import { Character, VoiceOption, AVAILABLE_VOICES } from "@shared/ModelTypes";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { globalClientOptions } from "@/globalClientOptions";

// Dynamic import of food data modules
const foodModules = import.meta.glob<FoodData>('@shared/prompts/foods_*.json', { eager: true, import: 'default' });

export interface Food extends Partial<Character> {
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

export interface FoodData {
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
  foods: Food[];
}

const localFoodData: Record<string, FoodData> = {};

// We assume that the files exist, since we validate them in the tests
for (const lang of AVAILABLE_LANGUAGES) {
  const moduleKey = Object.keys(foodModules).find(path => path.endsWith(`foods_${lang}.json`));
  if (moduleKey) {
    localFoodData[lang] = foodModules[moduleKey];
  }
}

// Freeze original foodData to make it immutable
Object.freeze(localFoodData);
for (const language in localFoodData) {
  for (let i = 0; i < localFoodData[language].foods.length; i++) {
    Object.freeze(localFoodData[language].foods[i]);
  }
}

function requireFoodData(language: string): FoodData {
  const data = localFoodData[language] ?? localFoodData[AVAILABLE_LANGUAGES[0]];
  if (!data) {
    throw new Error(
      `Missing food prompt bundle. language=${language}, fallback=${AVAILABLE_LANGUAGES[0]}`
    );
  }
  return data;
}

/** Frozen foods + chair/system prompts for one UI language (wizard). */
export function getFoodsBundle(lang: string): FoodData {
  return requireFoodData(lang);
}

// Infer the default voice from the configuration to ensure blankHuman is valid
const defaultChair = localFoodData[AVAILABLE_LANGUAGES[0]]?.foods.find(f => f.id === globalClientOptions.chairId);
const defaultVoice: VoiceOption = defaultChair?.voice || AVAILABLE_VOICES[0];

const blankHuman: Food = {
  id: "", // Will be set
  type: "panelist",
  name: "",
  description: "",
  voice: defaultVoice,
  voiceProvider: defaultChair?.voiceProvider,
  voiceTemperature: defaultChair?.voiceTemperature,
  voiceInstruction: defaultChair?.voiceInstruction,
  voiceLocale: defaultChair?.voiceLocale,
  size: 1.0
};

export function createHuman(index: number): Food {
  // Uses chair voice by default so validation passes.
  const newHuman = structuredClone(blankHuman);
  newHuman.id = "panelist" + index;
  newHuman.index = index;
  return newHuman;
}

export function createDefaultHumans(): Food[] {
  return [createHuman(0), createHuman(1), createHuman(2)];
}
