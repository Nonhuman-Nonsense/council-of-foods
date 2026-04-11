import { describe, it, expect } from 'vitest';
import { CreateMeetingSchema } from '../src/models/ValidationSchemas.js';

const topic = {
    id: 't1',
    title: 'T',
    description: 'D',
    prompt: 'P'
};

describe('ValidationSchemas Custom Voice Logic (CreateMeeting)', () => {

    it('should allow custom voice ID for Inworld provider', () => {
        const payload = {
            topic,
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'custom-cloned-voice-id-123',
                    voiceProvider: 'inworld' as const
                }
            ],
            language: 'en'
        };

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should validate standard OpenAI voices', () => {
        const payload = {
            topic,
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'alloy',
                    voiceProvider: 'openai' as const
                }
            ],
            language: 'en'
        };

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid OpenAI voices', () => {
        const payload = {
            topic,
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'invalid-voice',
                    voiceProvider: 'openai' as const
                }
            ],
            language: 'en'
        };

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });

    it('should validate standard Gemini voices', () => {
        const payload = {
            topic,
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'Puck',
                    voiceProvider: 'gemini' as const
                }
            ],
            language: 'en'
        };

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid Gemini voices', () => {
        const payload = {
            topic,
            characters: [
                {
                    id: 'char1',
                    name: 'Test Char',
                    voice: 'alloy',
                    voiceProvider: 'gemini' as const
                }
            ],
            language: 'en'
        };

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });
});
