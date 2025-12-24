// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages';
import fs from 'fs';
import path from 'path';

interface Topic {
    id: string;
    title: string;
    description?: string;
    prompt?: string;
}

interface TopicsData {
    metadata: {
        version: string;
        last_updated: string;
    };
    system: string;
    custom_topic: Topic;
    topics: Topic[];
}

describe('Validate Topics Data JSONs', () => {
    it('should have a valid JSON file for every available language', () => {
        AVAILABLE_LANGUAGES.forEach((lang) => {
            const filePath = path.resolve(__dirname, `../../src/prompts/topics_${lang}.json`);

            // 1. Check file existence
            expect(fs.existsSync(filePath), `Missing topics data file for language: ${lang}`).toBe(true);

            // 2. Load JSON
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content) as TopicsData;

            // 3. Validate Structure
            expect(data).toHaveProperty('metadata');
            expect(data.metadata).toHaveProperty('version');
            expect(data).toHaveProperty('system');
            expect(data).toHaveProperty('custom_topic');
            expect(data).toHaveProperty('topics');
            expect(Array.isArray(data.topics)).toBe(true);
            expect(data.topics.length).toBeGreaterThan(0);

            // 4. Validate System Prompt
            expect(typeof data.system).toBe('string');
            expect(data.system.length).toBeGreaterThan(0);

            // 5. Validate Custom Topic
            expect(data.custom_topic).toHaveProperty('id');
            expect(data.custom_topic).toHaveProperty('title');

            // 6. Validate Individual Topics
            data.topics.forEach((topic) => {
                expect(topic).toHaveProperty('id');
                expect(topic).toHaveProperty('title');
                expect(topic).toHaveProperty('description');
                expect(topic).toHaveProperty('prompt');
            });
        });
    });
});
