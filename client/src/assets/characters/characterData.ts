import { filename as toAssetBasename } from "@/utils";

const iconWebpGlob = import.meta.glob("/src/assets/characters/small/*.webp", {
    eager: true,
    import: "default",
}) as Record<string, string>;

const hevcGlob = import.meta.glob("/src/assets/characters/videos/*-hevc-safari.mp4", {
    eager: true,
    import: "default",
}) as Record<string, string>;

const vp9Glob = import.meta.glob("/src/assets/characters/videos/*-vp9-chrome.webm", {
    eager: true,
    import: "default",
}) as Record<string, string>;

function mapIcons(paths: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(paths)) {
        const normalized = path.replace(/\\/g, "/");
        const match = normalized.match(/\/small\/([^/]+)\.webp$/);
        if (match) out[match[1]] = url;
    }
    return out;
}

function mapCodec(
    paths: Record<string, string>,
    kind: "hevc" | "vp9",
): Record<string, string> {
    const re =
        kind === "hevc"
            ? /\/videos\/([^/]+)-hevc-safari\.mp4$/
            : /\/videos\/([^/]+)-vp9-chrome\.webm$/;
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(paths)) {
        const normalized = path.replace(/\\/g, "/");
        const match = normalized.match(re);
        if (match) out[match[1]] = url;
    }
    return out;
}

export const characterIconWebpByBasename = mapIcons(iconWebpGlob);
const characterHevcMp4ByBasename = mapCodec(hevcGlob, "hevc");
const characterVp9WebmByBasename = mapCodec(vp9Glob, "vp9");

/** Selection / UI icons (`add`, `panelist`, and one per character id). */
export function characterIconWebpUrl(iconBasename: string): string {
    const fn = toAssetBasename(iconBasename);
    const url = characterIconWebpByBasename[fn];
    if (!url) {
        throw new Error(
            `Missing character icon for "${iconBasename}" (expected src/assets/characters/small/${fn}.webp)`,
        );
    }
    return url;
}

/**
 * Foods uses one transparent video set for all breakpoints, but we match Forest's
 * helper name/signature so the two apps can share imports more easily.
 */
export function characterTransparentVideoUrls(
    characterId: string,
    _isMobile: boolean,
): { hevc: string; vp9: string } {
    const fn = toAssetBasename(characterId);
    const hevc = characterHevcMp4ByBasename[fn];
    const vp9 = characterVp9WebmByBasename[fn];
    if (!hevc || !vp9) {
        throw new Error(
            `Missing alpha video pair for "${characterId}" (expected src/assets/characters/videos/${fn}-hevc-safari.mp4 and …-vp9-chrome.webm)`,
        );
    }
    return { hevc, vp9 };
}
