import { describe, it, expect } from 'vitest';
import foodsSv from '@/prompts/foods_sv.json';
import topicsSv from '@/prompts/topics_sv.json';

describe('Multilingual Verification (Swedish)', () => {
    it('loads Swedish foods data', () => {
        expect(foodsSv).toBeDefined();
        // It seems to be an object with keys? Let's check.
        // If it is like { "salmon": {...}, "pine": {...} } then unique keys exist.
        expect(typeof foodsSv).toBe('object');
        expect(Object.keys(foodsSv).length).toBeGreaterThan(0);
    });

    it('loads Swedish topics data', () => {
        expect(topicsSv).toBeDefined();
        expect(topicsSv.topics).toBeDefined();
        expect(topicsSv.topics.length).toBeGreaterThan(0);
    });

    it('Swedish topics contain Forest system prompt', () => {
        // Deep check for system prompt structure
        expect(topicsSv.system).toBeDefined();
        // Check for Swedish "Forest Parliament" equivalent
        expect(topicsSv.system).toContain("Skogsparlamentet");
    });
});
