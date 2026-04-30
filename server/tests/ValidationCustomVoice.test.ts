import { describe, it, expect } from 'vitest';
import { CreateMeetingSchema } from '../src/models/ValidationSchemas.js';
import { MockFactory } from './factories/MockFactory.js';

const topic = MockFactory.createTopic({
    id: 't1',
    title: 'T',
    description: 'D',
    prompt: 'P'
});

describe('ValidationSchemas Custom Voice Logic (CreateMeeting)', () => {

    it('should allow custom voice ID for Inworld provider', () => {
        const payload = MockFactory.createCreateMeetingBody({
            topic,
            characters: [
                MockFactory.createCharacter({
                    id: 'char1',
                    name: 'Test Char',
                    description: 'D',
                    prompt: 'P',
                    voice: 'custom-cloned-voice-id-123',
                    voiceProvider: 'inworld' as const
                })
            ],
        });

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should validate standard OpenAI voices', () => {
        const payload = MockFactory.createCreateMeetingBody({
            topic,
            characters: [
                MockFactory.createCharacter({
                    id: 'char1',
                    name: 'Test Char',
                    description: 'D',
                    prompt: 'P',
                    voice: 'alloy',
                    voiceProvider: 'openai' as const
                })
            ],
        });

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid OpenAI voices', () => {
        const payload = MockFactory.createCreateMeetingBody({
            topic,
            characters: [
                MockFactory.createCharacter({
                    id: 'char1',
                    name: 'Test Char',
                    description: 'D',
                    prompt: 'P',
                    voice: 'invalid-voice',
                    voiceProvider: 'openai' as const
                })
            ],
        });

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });

    it('should validate standard Gemini voices', () => {
        const payload = MockFactory.createCreateMeetingBody({
            topic,
            characters: [
                MockFactory.createCharacter({
                    id: 'char1',
                    name: 'Test Char',
                    description: 'D',
                    prompt: 'P',
                    voice: 'Puck',
                    voiceProvider: 'gemini' as const
                })
            ],
        });

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(true);
    });

    it('should reject invalid Gemini voices', () => {
        const payload = MockFactory.createCreateMeetingBody({
            topic,
            characters: [
                MockFactory.createCharacter({
                    id: 'char1',
                    name: 'Test Char',
                    description: 'D',
                    prompt: 'P',
                    voice: 'alloy',
                    voiceProvider: 'gemini' as const
                })
            ],
        });

        const result = CreateMeetingSchema.safeParse(payload);
        expect(result.success).toBe(false);
    });
});
