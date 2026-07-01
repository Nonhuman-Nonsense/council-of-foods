// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages';
import fs from 'fs';
import path from 'path';
import { SHARED_PROMPTS_DIR } from '../sharedPromptsDir';

interface Topic {
    id: string;
    title: string;
    description?: string;
    prompt?: string;
    agendaPoints?: string[];
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

function loadTopicsData(lang: string): TopicsData {
    const filePath = path.join(SHARED_PROMPTS_DIR, `topics_${lang}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TopicsData;
}

describe('Validate Topics Data JSONs', () => {
    it('should have a valid JSON file for every available language', () => {
        AVAILABLE_LANGUAGES.forEach((lang) => {
            const filePath = path.join(SHARED_PROMPTS_DIR, `topics_${lang}.json`);

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
            expect(data.system).toContain('[TOPIC]');

            // 5. Validate Custom Topic
            expect(data.custom_topic).toHaveProperty('id');
            expect(data.custom_topic).toHaveProperty('title');

            // 6. Validate Individual Topics
            data.topics.forEach((topic) => {
                expect(topic).toHaveProperty('id');
                expect(topic).toHaveProperty('title');
                expect(topic).toHaveProperty('description');
                expect(topic).toHaveProperty('prompt');
                if (topic.agendaPoints != null) {
                    expect(Array.isArray(topic.agendaPoints)).toBe(true);
                    expect(topic.agendaPoints.length).toBeGreaterThan(0);
                    topic.agendaPoints.forEach((point) => {
                        expect(typeof point).toBe('string');
                        expect(point.trim().length).toBeGreaterThan(0);
                    });
                }
            });
        });
    });

    it('should have matching topic IDs across all languages', () => {
        if (AVAILABLE_LANGUAGES.length < 2) return;

        const reference = loadTopicsData(AVAILABLE_LANGUAGES[0]);
        const referenceIds = reference.topics.map(t => t.id).sort();

        for (const lang of AVAILABLE_LANGUAGES.slice(1)) {
            const other = loadTopicsData(lang);
            const otherIds = other.topics.map(t => t.id).sort();

            expect(otherIds, `Topic IDs in "${lang}" do not match "${AVAILABLE_LANGUAGES[0]}"`).toEqual(referenceIds);
        }
    });
});
