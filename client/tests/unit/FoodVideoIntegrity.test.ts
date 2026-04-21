import { describe, it, expect } from "vitest";

const foodsModules = import.meta.glob<{ foods: { id: string }[] }>("/src/prompts/foods_*.json", {
    eager: true,
    import: "default",
});

const hevcVideos = import.meta.glob("/src/assets/foods/videos/*-hevc-safari.mp4");
const vp9Videos = import.meta.glob("/src/assets/foods/videos/*-vp9-chrome.webm");

function collectFoodIds(): Set<string> {
    const ids = new Set<string>();
    for (const data of Object.values(foodsModules)) {
        for (const food of data.foods ?? []) {
            if (food?.id) ids.add(food.id);
        }
    }
    return ids;
}

function idsFromGlobKeys(keys: string[], suffix: string): Set<string> {
    const ids = new Set<string>();
    const escaped = suffix.replace(/\./g, "\\.");
    const re = new RegExp(`\\/([^/]+)${escaped}$`);
    for (const k of keys) {
        const m = k.match(re);
        if (m) ids.add(m[1]);
    }
    return ids;
}

describe("Food video integrity", () => {
    it("has a matching HEVC + VP9 pair for every food in prompts", () => {
        const foodIds = collectFoodIds();
        const hevcIds = idsFromGlobKeys(Object.keys(hevcVideos), "-hevc-safari.mp4");
        const vp9Ids = idsFromGlobKeys(Object.keys(vp9Videos), "-vp9-chrome.webm");

        for (const id of foodIds) {
            expect(hevcIds.has(id), `Missing HEVC for food: ${id}`).toBe(true);
            expect(vp9Ids.has(id), `Missing VP9 for food: ${id}`).toBe(true);
        }

        for (const id of hevcIds) {
            expect(foodIds.has(id), `Orphan HEVC video for unknown food: ${id}`).toBe(true);
            expect(vp9Ids.has(id), `HEVC without VP9 pair for food: ${id}`).toBe(true);
        }

        for (const id of vp9Ids) {
            expect(foodIds.has(id), `Orphan VP9 video for unknown food: ${id}`).toBe(true);
            expect(hevcIds.has(id), `VP9 without HEVC pair for food: ${id}`).toBe(true);
        }
    });
});
