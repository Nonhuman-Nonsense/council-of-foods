
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PronunciationUtils } from '../src/utils/PronunciationUtils.js';

let mockAliasShared: Record<string, string> = {};
let mockAliasEn: Record<string, string> = {};
let mockAliasSv: Record<string, string> = {};
let mockIpaEn: Record<string, string> = { "tomato": "/təˈmɑːtoʊ/" };

vi.mock('../src/data/pronunciations_alias.json', () => ({
    default: new Proxy({}, {
        get: (_target, prop) => (mockAliasShared as Record<string, string>)[prop as string],
        ownKeys: () => Reflect.ownKeys(mockAliasShared),
        getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(mockAliasShared, prop)
    })
}));

vi.mock('../src/data/pronunciations_alias_en.json', () => ({
    default: new Proxy({}, {
        get: (_target, prop) => (mockAliasEn as Record<string, string>)[prop as string],
        ownKeys: () => Reflect.ownKeys(mockAliasEn),
        getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(mockAliasEn, prop)
    })
}));

vi.mock('../src/data/pronunciations_alias_sv.json', () => ({
    default: new Proxy({}, {
        get: (_target, prop) => (mockAliasSv as Record<string, string>)[prop as string],
        ownKeys: () => Reflect.ownKeys(mockAliasSv),
        getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(mockAliasSv, prop)
    })
}));

vi.mock('../src/data/pronunciations_ipa_en.json', () => ({
    default: new Proxy({}, {
        get: (_target, prop) => (mockIpaEn as Record<string, string>)[prop as string],
        ownKeys: () => Reflect.ownKeys(mockIpaEn),
        getOwnPropertyDescriptor: (target, prop) => Reflect.getOwnPropertyDescriptor(mockIpaEn, prop)
    })
}));

describe('PronunciationUtils', () => {
    beforeEach(() => {
        (PronunciationUtils as unknown as { regexCache: Map<string, unknown> }).regexCache = new Map();
        vi.clearAllMocks();
        mockAliasShared = {};
        mockAliasEn = {};
        mockAliasSv = {};
        mockIpaEn = { "tomato": "/təˈmɑːtoʊ/" };
    });

    it('should handle empty pronunciations', () => {
        mockIpaEn = {};
        const result = PronunciationUtils.processText("Hello world", "en", { includeIpa: true });
        expect(result.processedText).toBe("Hello world");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should replace words with IPA and return map', () => {
        const result = PronunciationUtils.processText("I say tomato often.", "en", { includeIpa: true });
        expect(result.processedText).toBe("I say /təˈmɑːtoʊ/ often.");
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
    });

    it('should skip IPA for Swedish Inworld', () => {
        const result = PronunciationUtils.processText("I say tomato often.", "sv", { includeIpa: true });
        expect(result.processedText).toBe("I say tomato often.");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should skip IPA when includeIpa is false', () => {
        const result = PronunciationUtils.processText("I say tomato often.", "en", { includeIpa: false });
        expect(result.processedText).toBe("I say tomato often.");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should be case-insensitive for match but restore dictionary casing', () => {
        const result = PronunciationUtils.processText("Tomato tomato TOMATO", "en", { includeIpa: true });
        expect(result.processedText).toBe("/təˈmɑːtoʊ/ /təˈmɑːtoʊ/ /təˈmɑːtoʊ/");
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
    });

    it('should handle longer keys first to avoid partial matches', () => {
        mockIpaEn = {
            "super": "/suːpər/",
            "superman": "/suːpərmæn/"
        };

        const result = PronunciationUtils.processText("Superman is super.", "en", { includeIpa: true });

        expect(result.processedText).toContain("/suːpərmæn/");
        expect(result.processedText).toContain("/suːpər/");
        expect(result.processedText).not.toContain("/suːpər/man");
    });

    it('should handle keys with special characters and mixed boundaries', () => {
        mockAliasShared = {
            "RRRRRRRRR...": "rrrrrrrrrrrrr",
            "TICK. TICK.": "tick tick",
            "...start": "start-marker"
        };

        const result = PronunciationUtils.processText("I heard RRRRRRRRR... and TICK. TICK. ...start", "en", { includeIpa: false });

        expect(result.processedText).toContain("rrrrrrrrrrrrr");
        expect(result.processedText).toContain("tick tick");
        expect(result.processedText).toContain("start-marker");
        expect(result.replacedWords.get("rrrrrrrrrrrrr")).toBe("RRRRRRRRR...");
    });

    it('should handle mixed IPA and alias replacements', () => {
        mockAliasShared = {
            "RRRRRRRRR...": "rrrrrrrrrrrrr"
        };

        const result = PronunciationUtils.processText("I want a tomato while hearing RRRRRRRRR...", "en", { includeIpa: true });

        expect(result.processedText).toContain("/təˈmɑːtoʊ/");
        expect(result.processedText).toContain("rrrrrrrrrrrrr");

        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
        expect(result.replacedWords.get("rrrrrrrrrrrrr")).toBe("RRRRRRRRR...");
    });

    it('should apply language-specific aliases', () => {
        mockAliasEn = { "CO₂": "see oh two" };
        mockAliasSv = { "CO₂": "cee oh två" };

        const enResult = PronunciationUtils.processText("We emit CO₂.", "en", { includeIpa: false });
        const svResult = PronunciationUtils.processText("Vi släpper ut CO₂.", "sv", { includeIpa: false });

        expect(enResult.processedText).toBe("We emit see oh two.");
        expect(svResult.processedText).toBe("Vi släpper ut cee oh två.");
    });

    it('should cache regexes after first load', () => {
        PronunciationUtils.processText("test", "en", { includeIpa: true });
        const cache = (PronunciationUtils as unknown as { regexCache: Map<string, unknown[]> }).regexCache;
        expect(cache.has("en:true")).toBe(true);
        expect(cache.get("en:true")!.length).toBeGreaterThan(0);
    });

    it('should spell out meeting numbers for English TTS', () => {
        const result = PronunciationUtils.processText(
            'This concludes Council of Foods meeting #1020.',
            'en',
            { includeIpa: false },
        );
        expect(result.processedText).toBe(
            'This concludes Council of Foods meeting number 1020.',
        );
        expect(result.replacedWords.get('number 1020')).toBe('#1020');
    });

    it('should spell out meeting numbers for Swedish TTS', () => {
        const result = PronunciationUtils.processText(
            'Detta avslutar mötet #1020.',
            'sv',
            { includeIpa: false },
        );
        expect(result.processedText).toBe(
            'Detta avslutar mötet nummer 1020.',
        );
        expect(result.replacedWords.get('nummer 1020')).toBe('#1020');
    });

    it('should replace multiple meeting numbers in one string', () => {
        const result = PronunciationUtils.processText(
            'Replay of #42 and #1020.',
            'en',
            { includeIpa: false },
        );
        expect(result.processedText).toBe('Replay of number 42 and number 1020.');
        expect(result.replacedWords.get('number 42')).toBe('#42');
        expect(result.replacedWords.get('number 1020')).toBe('#1020');
    });

    it('should not replace hash tags without digits', () => {
        const result = PronunciationUtils.processText(
            'Join #climate action today.',
            'en',
            { includeIpa: false },
        );
        expect(result.processedText).toBe('Join #climate action today.');
    });
});
