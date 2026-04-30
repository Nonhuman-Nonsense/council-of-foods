import { describe, it, expect } from "vitest";
import { characterSetupEn } from "../characterSetupTestData";
import forestCharacters from "@shared/prompts/forest_characters.json";
import { filename } from "@/utils";

const largeHevc = import.meta.glob("/src/assets/characters/large/*-hevc-safari.mp4");
const largeVp9 = import.meta.glob("/src/assets/characters/large/*-vp9-chrome.webm");
const smallHevc = import.meta.glob("/src/assets/characters/small/*-hevc-safari.mp4");
const smallVp9 = import.meta.glob("/src/assets/characters/small/*-vp9-chrome.webm");
const riverHevc = import.meta.glob("/src/assets/characters/river-hevc-safari.mp4");
const riverVp9 = import.meta.glob("/src/assets/characters/river-vp9-chrome.webm");

function includesAsset(keys: string[], fragment: string): boolean {
    const needle = fragment.replace(/\\/g, "/");
    return keys.some((k) => k.replace(/\\/g, "/").includes(needle));
}

describe("Character video integrity", () => {
    it("default selectable characters have full alpha video codec sets (or river root)", () => {
        const largeHevcKeys = Object.keys(largeHevc);
        const largeVp9Keys = Object.keys(largeVp9);
        const smallHevcKeys = Object.keys(smallHevc);
        const smallVp9Keys = Object.keys(smallVp9);
        for (const character of characterSetupEn.characters) {
            const id = character.id;
            if (id === "river") {
                expect(Object.keys(riverHevc).length).toBe(1);
                expect(Object.keys(riverVp9).length).toBe(1);
                continue;
            }
            const fn = filename(id);
            expect(includesAsset(largeHevcKeys, `large/${fn}-hevc-safari.mp4`), `Missing large HEVC for ${id}`).toBe(
                true,
            );
            expect(includesAsset(largeVp9Keys, `large/${fn}-vp9-chrome.webm`), `Missing large VP9 for ${id}`).toBe(
                true,
            );
            expect(includesAsset(smallHevcKeys, `small/${fn}-hevc-safari.mp4`), `Missing small HEVC for ${id}`).toBe(
                true,
            );
            expect(includesAsset(smallVp9Keys, `small/${fn}-vp9-chrome.webm`), `Missing small VP9 for ${id}`).toBe(
                true,
            );
        }
    });

    it("forest_characters video entries have full large+small codec pairs", () => {
        const largeHevcKeys = Object.keys(largeHevc);
        const largeVp9Keys = Object.keys(largeVp9);
        const smallHevcKeys = Object.keys(smallHevc);
        const smallVp9Keys = Object.keys(smallVp9);
        for (const entry of forestCharacters) {
            if (entry.type !== "video") continue;
            const fn = filename(entry.id);
            expect(
                includesAsset(largeHevcKeys, `large/${fn}-hevc-safari.mp4`),
                `Missing large HEVC for ${entry.id}`,
            ).toBe(true);
            expect(
                includesAsset(largeVp9Keys, `large/${fn}-vp9-chrome.webm`),
                `Missing large VP9 for ${entry.id}`,
            ).toBe(true);
            expect(
                includesAsset(smallHevcKeys, `small/${fn}-hevc-safari.mp4`),
                `Missing small HEVC for ${entry.id}`,
            ).toBe(true);
            expect(
                includesAsset(smallVp9Keys, `small/${fn}-vp9-chrome.webm`),
                `Missing small VP9 for ${entry.id}`,
            ).toBe(true);
        }
    });
});
