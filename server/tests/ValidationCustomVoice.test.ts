
import { describe, it, expect } from 'vitest';
import { SetupOptionsSchema } from '../src/models/ValidationSchemas.js';

describe('ValidationSchemas Custom Voice Logic', () => {

    it('should allow custom voice ID for Inworld provider', () => {
        const payload = {
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'custom-cloned-voice-id-123',
                    voiceProvider: 'inworld'
                }
            ],
            language: 'en',
            topic: 'Test Topic',
            options: {} // Partial options allowed
        };

        const result = SetupOptionsSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should validate standard OpenAI voices', () => {
        const payload = {
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'alloy',
                    voiceProvider: 'openai'
                }
            ],
            language: 'en',
            topic: 'Test Topic',
            options: {}
        };

        const result = SetupOptionsSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid OpenAI voices', () => {
        const payload = {
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'invalid-voice',
                    voiceProvider: 'openai'
                }
            ],
            language: 'en',
            topic: 'Test Topic'
        };

        const result = SetupOptionsSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });

    it('should validate standard Gemini voices', () => {
        const payload = {
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'Puck',
                    voiceProvider: 'gemini'
                }
            ],
            language: 'en',
            topic: 'Test Topic'
        };

        const result = SetupOptionsSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid Gemini voices', () => {
        const payload = {
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'alloy', // Openai voice, invalid for gemini
                    voiceProvider: 'gemini'
                }
            ],
            language: 'en',
            topic: 'Test Topic'
        };

        const result = SetupOptionsSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });
});
