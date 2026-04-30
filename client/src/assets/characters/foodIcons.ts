const foodIconGlob = import.meta.glob("/src/assets/foods/small/*.webp", {
    eager: true,
    import: "default",
}) as Record<string, string>;

function mapByIconId(paths: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, url] of Object.entries(paths)) {
        const match = path.match(/\/([^/]+)\.webp$/);
        if (match) out[match[1]] = url;
    }
    return out;
}

export const foodIconWebpById = mapByIconId(foodIconGlob);

/**
 * Selection / UI icons (`add`, `panelist`, and one per food id).
 * Keep this lookup outside `SelectFoods` so Foods and Forest share the same
 * component-level contract even though their asset folders differ.
 */
export function foodIconWebpUrl(iconBasename: string): string {
    const url = foodIconWebpById[iconBasename];
    if (!url) {
        throw new Error(
            `Missing food icon for "${iconBasename}" (expected src/assets/foods/small/${iconBasename}.webp)`,
        );
    }
    return url;
}
