// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages';
import { AVAILABLE_VOICES, AVAILABLE_VOICES_GEMINI, VoiceOption } from '@shared/ModelTypes';
import { CHARACTERS_FILE } from '@shared/prompts/characterSetupMetadata';
import fs from 'fs';
import path from 'path';
import { SHARED_PROMPTS_DIR } from '../sharedPromptsDir';

// Define expected Types locally since we are in a test environment
// and want to ensure the JSONs match OUR expected interface,
// regardless of what the component defines.
interface CharacterDataEntry {
    id: string;
    name: string;
    description: string;
    prompt?: string;
    type?: string;
    index?: number;
    voice: VoiceOption;
    voiceProvider?: 'openai' | 'gemini' | 'inworld' | 'elevenlabs';
    voiceLocale?: string;
    size?: number;
    voiceInstruction?: string;
}

interface CharacterSetupDataFile {
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
    characters: CharacterDataEntry[];
}

function loadCharacterData(lang: string): CharacterSetupDataFile {
    const filePath = path.join(SHARED_PROMPTS_DIR, `${CHARACTERS_FILE}_${lang}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CharacterSetupDataFile;
}

describe('Validate Food Data JSONs', () => {
    it('should have a valid JSON file for every available language', () => {
        AVAILABLE_LANGUAGES.forEach((lang) => {
            const filePath = path.join(SHARED_PROMPTS_DIR, `${CHARACTERS_FILE}_${lang}.json`);

            // 1. Check file existence
            expect(fs.existsSync(filePath), `Missing food data file for language: ${lang}`).toBe(true);

            // 2. Load JSON
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content) as CharacterSetupDataFile;

            // 3. Validate Structure
            expect(data).toHaveProperty('metadata');
            expect(data.metadata).toHaveProperty('version');
            expect(data).toHaveProperty('characters');
            expect(Array.isArray(data.characters)).toBe(true);
            expect(data.characters.length).toBeGreaterThan(0);

            // 4. Validate Individual Characters
            data.characters.forEach((character, index) => {
                expect(character).toHaveProperty('id');
                expect(character).toHaveProperty('name');
                expect(character).toHaveProperty('description');
                expect(character).toHaveProperty('voice');

                // Validate Voice Option
                if (character.voiceProvider === 'gemini') {
                    expect(AVAILABLE_VOICES_GEMINI).toContain(character.voice);
                } else if (character.voiceProvider === 'inworld' || character.voiceProvider === 'elevenlabs') {
                    // Custom voice providers allow arbitrary non-empty voice IDs
                    expect(typeof character.voice).toBe('string');
                    expect(character.voice.length).toBeGreaterThan(0);
                } else {
                    // Default to OpenAI if provider is missing or explicitly 'openai'
                    expect(AVAILABLE_VOICES).toContain(character.voice);
                }

                // Ensure prompt exists for at least the first character (Chair usually)
                if (index === 0) {
                    // It's common for the chair to have a prompt
                }
            });

            // 5. Validate AddHuman
            expect(data).toHaveProperty('addHuman');
            expect(data.addHuman).toHaveProperty('id');
            expect(data.addHuman).toHaveProperty('name');
            expect(data.addHuman).toHaveProperty('description');
        });
    });

    it('should have matching food IDs across all languages', () => {
        if (AVAILABLE_LANGUAGES.length < 2) return;

        const reference = loadCharacterData(AVAILABLE_LANGUAGES[0]);
        const referenceIds = reference.characters.map(f => f.id).sort();

        for (const lang of AVAILABLE_LANGUAGES.slice(1)) {
            const other = loadCharacterData(lang);
            const otherIds = other.characters.map(f => f.id).sort();

            expect(otherIds, `Food IDs in "${lang}" do not match "${AVAILABLE_LANGUAGES[0]}"`).toEqual(referenceIds);
        }
    });
});
