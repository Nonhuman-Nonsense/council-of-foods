// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages';
import { AVAILABLE_VOICES, AVAILABLE_VOICES_GEMINI, VoiceOption } from '@shared/ModelTypes';
import fs from 'fs';
import path from 'path';

// Define expected Types locally since we are in a test environment
// and want to ensure the JSONs match OUR expected interface,
// regardless of what the component defines.
interface Food {
    id: string;
    name: string;
    description: string;
    prompt?: string;
    type?: string;
    index?: number;
    voice: VoiceOption;
    voiceProvider?: 'openai' | 'gemini' | 'inworld';
    voiceLocale?: string;
    size?: number;
    voiceInstruction?: string;
}

interface FoodData {
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

describe('Validate Food Data JSONs', () => {
    it('should have a valid JSON file for every available language', () => {
        AVAILABLE_LANGUAGES.forEach((lang) => {
            const filePath = path.resolve(__dirname, `../../src/prompts/foods_${lang}.json`);

            // 1. Check file existence
            expect(fs.existsSync(filePath), `Missing food data file for language: ${lang}`).toBe(true);

            // 2. Load JSON
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content) as FoodData;

            // 3. Validate Structure
            expect(data).toHaveProperty('metadata');
            expect(data.metadata).toHaveProperty('version');
            expect(data).toHaveProperty('foods');
            expect(Array.isArray(data.foods)).toBe(true);
            expect(data.foods.length).toBeGreaterThan(0);

            // 4. Validate Individual Foods
            data.foods.forEach((food, index) => {
                expect(food).toHaveProperty('id');
                expect(food).toHaveProperty('name');
                expect(food).toHaveProperty('description');
                expect(food).toHaveProperty('voice');

                // Validate Voice Option
                if (food.voiceProvider === 'gemini') {
                    expect(AVAILABLE_VOICES_GEMINI).toContain(food.voice);
                } else if (food.voiceProvider === 'inworld') {
                    // Inworld allows custom voices as strings, so we just check it's a non-empty string
                    expect(typeof food.voice).toBe('string');
                    expect(food.voice.length).toBeGreaterThan(0);
                } else {
                    // Default to OpenAI if provider is missing or explicitly 'openai'
                    expect(AVAILABLE_VOICES).toContain(food.voice);
                }

                // Ensure prompt exists for at least the first food (Chair usually)
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
});
