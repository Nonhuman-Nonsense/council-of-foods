import { describe, expect, it } from "vitest";
import { resolvePreferredLanguageFromCountry } from "@shared/AvailableLanguages.js";

describe("resolvePreferredLanguageFromCountry", () => {
    const ENGLISH_ONLY = ["en"] as const;
    const ENGLISH_AND_SWEDISH = ["en", "sv"] as const;

    it("returns undefined when country code is missing", () => {
        expect(resolvePreferredLanguageFromCountry(undefined, ENGLISH_AND_SWEDISH)).toBeUndefined();
        expect(resolvePreferredLanguageFromCountry("", ENGLISH_AND_SWEDISH)).toBeUndefined();
    });

    it("returns undefined for unmapped countries", () => {
        expect(resolvePreferredLanguageFromCountry("US", ENGLISH_AND_SWEDISH)).toBeUndefined();
        expect(resolvePreferredLanguageFromCountry("NO", ENGLISH_AND_SWEDISH)).toBeUndefined();
    });

    it("returns sv for Sweden when sv is available", () => {
        expect(resolvePreferredLanguageFromCountry("SE", ENGLISH_AND_SWEDISH)).toBe("sv");
        expect(resolvePreferredLanguageFromCountry("se", ENGLISH_AND_SWEDISH)).toBe("sv");
    });

    it("returns undefined for Sweden when sv is not available", () => {
        expect(resolvePreferredLanguageFromCountry("SE", ENGLISH_ONLY)).toBeUndefined();
    });
});
