
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InworldPronunciationUtils } from '../src/utils/InworldPronunciationUtils.js';
import fs from 'fs';

// Mock fs to control the pronunciations file content
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn()
    }
}));

// Mock path for consistency
vi.mock('path', async () => {
    const actual = await vi.importActual('path');
    return {
        ...actual,
        resolve: vi.fn((...args) => args.join('/')), // Simplified resolve
        join: vi.fn((...args) => args.join('/'))
    };
});


describe('InworldPronunciationUtils', () => {
    beforeEach(() => {
        // Clear cached state
        (InworldPronunciationUtils as any).pronunciations = null;
        (InworldPronunciationUtils as any).sortedKeys = null;
        vi.clearAllMocks();
    });

    it('should return text unchanged if pronunciations file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const result = InworldPronunciationUtils.processTextWithIPA("Hello world");

        expect(result.processedText).toBe("Hello world");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should return text unchanged if pronunciations file is empty', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue("{}");

        const result = InworldPronunciationUtils.processTextWithIPA("Hello world");

        expect(result.processedText).toBe("Hello world");
        expect(result.replacedWords.size).toBe(0);
    });

    it('should replace words with IPA and return map', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockData = JSON.stringify({
            "world": "/wɜːld/",
            "test": "/tɛst/"
        });
        vi.mocked(fs.readFileSync).mockReturnValue(mockData);

        const result = InworldPronunciationUtils.processTextWithIPA("Hello world, this is a test.");




        expect(result.processedText).toBe("Hello /wɜːld/, this is a /tɛst/.");
        expect(result.replacedWords.get("/wɜːld/")).toBe("world");
        expect(result.replacedWords.get("/tɛst/")).toBe("test");
    });

    it('should be case-insensitive for matching', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        const mockData = JSON.stringify({
            "tomato": "/təˈmɑːtoʊ/"
        });
        vi.mocked(fs.readFileSync).mockReturnValue(mockData);

        const result = InworldPronunciationUtils.processTextWithIPA("I love Tomato soup.");

        expect(result.processedText).toBe("I love /təˈmɑːtoʊ/ soup.");
        expect(result.replacedWords.get("/təˈmɑːtoʊ/")).toBe("tomato");
    });

    it('should handle longer keys first to avoid partial matches', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const mockData = JSON.stringify({
            "super": "/suːpər/",
            "superman": "/suːpərmæn/"
        });
        vi.mocked(fs.readFileSync).mockReturnValue(mockData);

        const result = InworldPronunciationUtils.processTextWithIPA("Is it a bird? No it's Superman!");

        // "Superman" should be replaced by its IPA, not "Super" + "man".
        expect(result.processedText).toContain("/suːpərmæn/");
        expect(result.processedText).not.toContain("/suːpər/man");
    });

    it('should cache pronunciations after first load', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{"a": "/a/"}');

        InworldPronunciationUtils.processTextWithIPA("test");
        InworldPronunciationUtils.processTextWithIPA("test again");

        expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
});
