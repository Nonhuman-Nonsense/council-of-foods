const hevcGlob = import.meta.glob("/src/assets/foods/videos/*-hevc-safari.mp4", {
    eager: true,
    import: "default",
}) as Record<string, string>;

const vp9Glob = import.meta.glob("/src/assets/foods/videos/*-vp9-chrome.webm", {
    eager: true,
    import: "default",
}) as Record<string, string>;

function mapByFoodId(
    paths: Record<string, string>,
    kind: "hevc" | "vp9",
): Record<string, string> {
    const re =
        kind === "hevc"
            ? /\/([^/]+)-hevc-safari\.mp4$/
            : /\/([^/]+)-vp9-chrome\.webm$/;
    const out: Record<string, string> = {};
    for (const [p, url] of Object.entries(paths)) {
        const m = p.match(re);
        if (m) out[m[1]] = url;
    }
    return out;
}

export const foodVideoHevcMp4ById = mapByFoodId(hevcGlob, "hevc");
export const foodVideoVp9WebmById = mapByFoodId(vp9Glob, "vp9");

export function foodVideoUrlsForId(foodId: string): { hevc: string; vp9: string } {
    const hevc = foodVideoHevcMp4ById[foodId];
    const vp9 = foodVideoVp9WebmById[foodId];
    if (!hevc || !vp9) {
        throw new Error(
            `Missing food video pair for id "${foodId}" (expected ${foodId}-hevc-safari.mp4 and ${foodId}-vp9-chrome.webm)`,
        );
    }
    return { hevc, vp9 };
}
