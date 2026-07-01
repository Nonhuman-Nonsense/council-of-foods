import fs from "node:fs";
import path from "node:path";
import { chairIdFromCharacters, CHARACTERS_FILE } from "@shared/prompts/characterSetupMetadata.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";

export type ChairVoiceProvider = "openai" | "inworld" | "elevenlabs";

/** Voice fields used for council TTS and/or live chair realtime sessions. */
export type ChairVoiceProfile = {
    voice: string;
    voiceProvider: ChairVoiceProvider;
    voiceLocale?: string;
    voiceInstruction?: string;
    voiceTemperature?: number;
    voiceStability?: number;
    voiceStyle?: number;
    voiceSpeed?: number;
};

export type ChairRealtimeLanguageConfig = GlobalOptions["chairRealtime"]["languages"][string];
export type HumanInputRealtimeLanguageConfig = GlobalOptions["humanInputRealtime"]["languages"][string];

type CharacterSetupCharacter = {
    id: string;
    voice: string;
    voiceProvider?: string;
    voiceInstruction?: string;
    voiceLocale?: string;
    voiceSpeed?: number;
    voiceTemperature?: number;
    voiceStability?: number;
    voiceStyle?: number;
};

type CharacterSetupDataFile = {
    characters: CharacterSetupCharacter[];
};

const sharedPromptsDir = path.join(process.cwd(), "../shared/prompts");

const REALTIME_AGENT_VOICE_PROVIDERS = new Set<ChairVoiceProvider>(["openai", "inworld"]);

function readCharacterSetupBundle(language: string): CharacterSetupDataFile {
    const requestedPath = path.join(sharedPromptsDir, `${CHARACTERS_FILE}_${language}.json`);
    const fallbackPath = path.join(sharedPromptsDir, `${CHARACTERS_FILE}_en.json`);
    const filePath = fs.existsSync(requestedPath) ? requestedPath : fallbackPath;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CharacterSetupDataFile;
}

export const defaultCharacterSetupBundle = JSON.parse(
    fs.readFileSync(path.join(sharedPromptsDir, `${CHARACTERS_FILE}_en.json`), "utf-8"),
) as CharacterSetupDataFile;

/** Chair id from the default character-setup bundle (same convention as client `CHAIR_ID`). */
export const CHAIR_ID = chairIdFromCharacters(defaultCharacterSetupBundle.characters);

export function normalizeSetupLanguage(language: string): string {
    return language.toLowerCase().startsWith("sv") ? "sv" : "en";
}

export function getCharacterSetupBundle(language: string): CharacterSetupDataFile {
    return readCharacterSetupBundle(normalizeSetupLanguage(language));
}

function getChairCharacter(language: string): CharacterSetupCharacter {
    return getCharacterSetupBundle(language).characters[0];
}

function parseVoiceProvider(raw: string | undefined): ChairVoiceProvider {
    if (raw === "inworld" || raw === "openai" || raw === "elevenlabs") {
        return raw;
    }
    return "openai";
}

function characterToVoiceProfile(character: CharacterSetupCharacter): ChairVoiceProfile {
    return {
        voice: character.voice,
        voiceProvider: parseVoiceProvider(character.voiceProvider),
        ...(character.voiceLocale ? { voiceLocale: character.voiceLocale } : {}),
        ...(character.voiceInstruction ? { voiceInstruction: character.voiceInstruction } : {}),
        ...(character.voiceSpeed != null ? { voiceSpeed: character.voiceSpeed } : {}),
        ...(character.voiceTemperature != null ? { voiceTemperature: character.voiceTemperature } : {}),
        ...(character.voiceStability != null ? { voiceStability: character.voiceStability } : {}),
        ...(character.voiceStyle != null ? { voiceStyle: character.voiceStyle } : {}),
    };
}

function assertRealtimeAgentVoice(language: string, profile: ChairVoiceProfile): void {
    if (!REALTIME_AGENT_VOICE_PROVIDERS.has(profile.voiceProvider)) {
        throw new Error(
            `chairRealtime.languages.${language}.agentVoice: ${profile.voiceProvider} cannot be used for live chair realtime`
        );
    }
}

export function getChairRealtimeLanguageConfig(
    language: string,
    options: GlobalOptions = getGlobalOptions()
): ChairRealtimeLanguageConfig {
    const normalized = normalizeSetupLanguage(language);
    const config =
        options.chairRealtime.languages[normalized] ?? options.chairRealtime.languages.en;
    if (!config) {
        throw new Error(`chairRealtime.languages is missing entries for "${normalized}" and "en"`);
    }
    return config;
}

/** Council meeting TTS: always the chair row from the character-setup bundle. */
export function getChairMeetingVoice(language: string): ChairVoiceProfile {
    return characterToVoiceProfile(getChairCharacter(language));
}

/** Live chair agent (meta-agent, voice-guide): unified or split per chairRealtime.strategy. */
export function getChairAgentVoice(language: string, options: GlobalOptions = getGlobalOptions()): ChairVoiceProfile {
    const normalized = normalizeSetupLanguage(language);
    if (options.chairRealtime.strategy === "unified") {
        return getChairMeetingVoice(normalized);
    }

    const languageConfig = getChairRealtimeLanguageConfig(normalized, options);
    if (!languageConfig.agentVoice) {
        throw new Error(
            `chairRealtime.strategy is "split" but languages.${normalized}.agentVoice is not configured`
        );
    }

    const profile = languageConfig.agentVoice;
    assertRealtimeAgentVoice(normalized, profile);
    return profile;
}

export function getHumanInputRealtimeLanguageConfig(
    language: string,
    options: GlobalOptions = getGlobalOptions()
): HumanInputRealtimeLanguageConfig {
    const normalized = normalizeSetupLanguage(language);
    const config =
        options.humanInputRealtime.languages[normalized] ?? options.humanInputRealtime.languages.en;
    if (!config) {
        throw new Error(`humanInputRealtime.languages is missing entries for "${normalized}" and "en"`);
    }
    return config;
}

export function validateHumanInputRealtimeConfig(options: GlobalOptions): void {
    for (const [lang, languageConfig] of Object.entries(options.humanInputRealtime.languages)) {
        if (languageConfig.provider === "inworld") {
            if (!languageConfig.llmModel?.trim()) {
                throw new Error(`humanInputRealtime.languages.${lang}.llmModel is required for inworld`);
            }
            if (!languageConfig.transcriptionModel?.trim()) {
                throw new Error(
                    `humanInputRealtime.languages.${lang}.transcriptionModel is required for inworld`
                );
            }
        }
    }
}

export function validateChairRealtimeConfig(options: GlobalOptions): void {
    for (const [lang, languageConfig] of Object.entries(options.chairRealtime.languages)) {
        if (languageConfig.agentVoice) {
            assertRealtimeAgentVoice(lang, languageConfig.agentVoice);
        }
        if (options.chairRealtime.strategy === "split" && !languageConfig.agentVoice) {
            throw new Error(`chairRealtime.strategy is "split" but languages.${lang}.agentVoice is missing`);
        }
    }
}
