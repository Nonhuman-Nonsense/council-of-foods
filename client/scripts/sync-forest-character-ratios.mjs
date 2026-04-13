/**
 * Reads forest character image/video dimensions from client/public/characters,
 * verifies all transparent video variants share one aspect ratio, and writes
 * src/generated/forestCharacterRatios.ts
 *
 * Requires assets under public/characters (see FoodAnimation paths). River is omitted.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ffprobe from "@ffprobe-installer/ffprobe";
import imageSize from "image-size";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(__dirname, "..");
const publicCharacters = join(clientRoot, "public", "characters");
const manifestPath = join(clientRoot, "src", "prompts", "forest_characters.json");
const outPath = join(clientRoot, "src", "generated", "forestCharacterRatios.ts");

// Allow tiny drift between codecs and large/small encodes; still catches materially wrong aspect ratios.
const RATIO_EPS = 0.005;

function filenameId(id) {
  return String(id).toLowerCase().replaceAll(" ", "_");
}

function getImageDimensions(absPath) {
  const buf = readFileSync(absPath);
  const r = imageSize(buf);
  if (!r.width || !r.height) {
    throw new Error(`Could not read dimensions for image: ${absPath}`);
  }
  return { width: r.width, height: r.height };
}

function getVideoDimensions(absPath) {
  const out = execFileSync(
    ffprobe.path,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      absPath,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  const line = out.trim().split("\n")[0];
  if (!line) throw new Error(`ffprobe produced no output for: ${absPath}`);
  const [w, h] = line.split(",").map((s) => parseInt(s, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`Invalid video dimensions for ${absPath}: ${line}`);
  }
  return { width: w, height: h };
}

function ratioKey(w, h) {
  return w / h;
}

const RATIO_IDENTICAL_EPS = 1e-12;

function formatDimensionLines(keys) {
  return keys.map((k) => `  ${k.path}  ->  ${k.w} / ${k.h} = ${k.r}`).join("\n");
}

function assertSameRatio(id, label, pairs) {
  const keys = pairs.map(({ path: p, w, h }) => ({
    path: p,
    w,
    h,
    r: ratioKey(w, h),
  }));
  const base = keys[0].r;
  let maxDiff = 0;
  for (let i = 1; i < keys.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(keys[i].r - base));
  }

  const lines = formatDimensionLines(keys);

  if (maxDiff > RATIO_EPS) {
    console.error(
      `\n[sync-forest-character-ratios] Aspect ratio mismatch for "${id}" (${label}) (exceeds RATIO_EPS=${RATIO_EPS}):\n` +
        lines +
        `\n  reference ratio (first file) ≈ ${base}\n  max |Δratio| ≈ ${maxDiff}\n`,
    );
    process.exit(1);
  }

  if (maxDiff > RATIO_IDENTICAL_EPS) {
    console.warn(
      `[sync-forest-character-ratios] Warning: "${id}" (${label}) — aspect ratios differ slightly but stay within RATIO_EPS (${RATIO_EPS}). ` +
        `max |Δratio| ≈ ${maxDiff}. Check encodes (e.g. rotato rounding).\n` +
        lines +
        `\n  reference (first file) ≈ ${base}\n`,
    );
  }
}

function main() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest)) {
    console.error("forest_characters.json must be a JSON array.");
    process.exit(1);
  }

  /** @type {Record<string, { width: number; height: number }>} */
  const dimensions = {};
  /** @type {Record<string, number>} */
  const ratios = {};

  for (const entry of manifest) {
    const id = entry.id;
    const fn = filenameId(id);

    if (entry.type === "image") {
      const rel = join("images", `${fn}.avif`);
      const abs = join(publicCharacters, rel);
      try {
        const { width, height } = getImageDimensions(abs);
        dimensions[id] = { width, height };
        ratios[id] = ratioKey(width, height);
      } catch (e) {
        console.error(`[sync-forest-character-ratios] Failed reading image for "${id}" (${abs}):`, e.message || e);
        process.exit(1);
      }
      continue;
    }

    if (entry.type === "transparent") {
      const rels = [
        join("large", `${fn}-vp9-chrome.webm`),
        join("large", `${fn}-hevc-safari.mp4`),
        join("small", `${fn}-vp9-chrome.webm`),
        join("small", `${fn}-hevc-safari.mp4`),
      ];
      const measured = [];
      for (const rel of rels) {
        const abs = join(publicCharacters, rel);
        try {
          const { width, height } = getVideoDimensions(abs);
          measured.push({ path: rel, w: width, h: height });
        } catch (e) {
          console.error(
            `[sync-forest-character-ratios] Failed reading video for "${id}" (${abs}):`,
            e.message || e,
          );
          process.exit(1);
        }
      }
      assertSameRatio(id, "large+small webm+mp4", measured);
      const { w, h } = measured[0];
      dimensions[id] = { width: w, height: h };
      ratios[id] = ratioKey(w, h);
      continue;
    }

    console.error(`Unknown type for "${id}": ${entry.type}`);
    process.exit(1);
  }

  const ids = Object.keys(ratios).sort();
  const dimLines = ids.map(
    (id) => `  ${JSON.stringify(id)}: { width: ${dimensions[id].width}, height: ${dimensions[id].height} },`,
  );
  const ratioLines = ids.map((id) => `  ${JSON.stringify(id)}: ${ratios[id]},`);

  const ts = `// Generated by scripts/sync-forest-character-ratios.mjs — do not edit by hand.
// Run: npm run build (prebuild) or npm run dev (predev)

export const forestCharacterDimensions: Record<string, { width: number; height: number }> = {
${dimLines.join("\n")}
};

export const forestCharacterRatios: Record<string, number> = {
${ratioLines.join("\n")}
};
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, ts, "utf8");
  console.log(`[sync-forest-character-ratios] Wrote ${outPath} (${ids.length} characters).`);
}

main();
