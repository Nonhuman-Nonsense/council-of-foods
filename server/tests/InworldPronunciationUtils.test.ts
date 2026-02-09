
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InworldPronunciationUtils } from '../src/utils/InworldPronunciationUtils.js';

// Mutable mock data store
let mockPronunciations: Record<string, string> = { "tomato": "/təˈmɑːtoʊ/" };

// Mock the JSON import
vi.mock('../src/data/pronunciations.json', () => ({
    default: new Proxy({}, {
        get: (_target, prop) => (mockPronunciations as any)[prop],
        ownKeys: () => Reflect.ownKeys(mockPronunciations),
        getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(mockPronunciations, prop)
    })
}));

describe('InworldPronunciationUtils', () => {
    beforeEach(() => {
        // Clear cached state
        (InworldPronunciationUtils as any).sortedRegexes = null;
        vi.clearAllMocks();
        // Reset default data
        mockPronunciations = { "tomato": "/təˈmɑːtoʊ/" };
    });

    it('should handle empty pronunciations', () => {
        mockPronunciations = {};
        const result = InworldPronunciationUtils.processTextWithIPA("Hello world");
        expect(result.processedText).toBe("Hello world");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should replace words with IPA and return map', () => {
        const result = InworldPronunciationUtils.processTextWithIPA("I say tomato often.");
        expect(result.processedText).toBe("I say /təˈmɑːtoʊ/ often.");
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
    });

    it('should be case-insensitive for match but restore dictionary casing', () => {
        const result = InworldPronunciationUtils.processTextWithIPA("Tomato tomato TOMATO");
        expect(result.processedText).toBe("/təˈmɑːtoʊ/ /təˈmɑːtoʊ/ /təˈmɑːtoʊ/");
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
    });

    it('should handle longer keys first to avoid partial matches', () => {
        mockPronunciations = {
            "super": "/suːpər/",
            "superman": "/suːpərmæn/"
        };

        const result = InworldPronunciationUtils.processTextWithIPA("Superman is super.");

        expect(result.processedText).toContain("/suːpərmæn/");
        expect(result.processedText).toContain("/suːpər/");
        expect(result.processedText).not.toContain("/suːpər/man");
    });

    it('should handle keys with special characters and mixed boundaries', () => {
        mockPronunciations = {
            "RRRRRRRRR...": "rrrrrrrrrrrrr",
            "TICK. TICK.": "tick tick",
            "...start": "start-marker"
        };

        const result = InworldPronunciationUtils.processTextWithIPA("I heard RRRRRRRRR... and TICK. TICK. ...start");

        expect(result.processedText).toContain("rrrrrrrrrrrrr");
        expect(result.processedText).toContain("tick tick");
        expect(result.processedText).toContain("start-marker");
        expect(result.replacedWords.get("rrrrrrrrrrrrr")).toBe("RRRRRRRRR...");
    });

    it('should handle mixed IPA and symbol replacements', () => {
        mockPronunciations = {
            "tomato": "/təˈmɑːtoʊ/",
            "RRRRRRRRR...": "rrrrrrrrrrrrr"
        };

        const result = InworldPronunciationUtils.processTextWithIPA("I want a tomato while hearing RRRRRRRRR...");

        expect(result.processedText).toContain("/təˈmɑːtoʊ/");
        expect(result.processedText).toContain("rrrrrrrrrrrrr");

        // Check reverse map
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
        expect(result.replacedWords.get("rrrrrrrrrrrrr")).toBe("RRRRRRRRR...");
    });

    it('should cache regexes after first load', () => {
        // Since we are mocking the module, we verify valid state
        InworldPronunciationUtils.processTextWithIPA("test");
        const regexes = (InworldPronunciationUtils as any).sortedRegexes;
        expect(regexes).not.toBeNull();
        expect(regexes.length).toBeGreaterThan(0);

        // Ensure it's not re-computed if we call it again (implicit, hard to test without spy on module load which is static)
        // But functionally, if sortedRegexes is populated, it returns early.
    });
});
