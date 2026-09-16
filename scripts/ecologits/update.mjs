#!/usr/bin/env node
/**
 * Keep shared/footprint/ecologits.json in step with EcoLogits releases.
 *
 *   npm run footprint:check                  compare the committed version with the latest on PyPI
 *   npm run footprint:update                 regenerate with the latest EcoLogits
 *   npm run footprint:update -- --version X  regenerate with a specific version (e.g. after editing export.py)
 *
 * Needs uv (https://docs.astral.sh/uv/). Python and EcoLogits are fetched by uv on demand;
 * nothing is installed into the project or the Docker image.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const exportScript = path.join(root, "scripts/ecologits/export.py");
const outFile = path.join(root, "shared/footprint/ecologits.json");
/** Response size used in the summary — Mistral's LCA reference unit. */
const SUMMARY_UNITS = 400;

const args = process.argv.slice(2);
const versionArg = args.includes("--version") ? args[args.indexOf("--version") + 1] : undefined;

function readCurrent() {
    return fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;
}

async function latestVersion() {
    const res = await fetch("https://pypi.org/pypi/ecologits/json");
    if (!res.ok) throw new Error(`PyPI returned ${res.status}`);
    return (await res.json()).info.version;
}

/** Energy (Wh) of one SUMMARY_UNITS response, at the given range end, with unmeasured latency. */
function summaryWh(model, end) {
    const c = model[end];
    const tokens = SUMMARY_UNITS * model.tokensPerUnit;
    const seconds = tokens * c.secondsPerToken + c.firstTokenSeconds;
    return (c.perToken.energy * tokens + c.perGenerationSecond.energy * seconds) * 1000;
}

function printSummary(before, after) {
    const fmt = (m) => (m ? `${summaryWh(m, "low").toPrecision(3)}–${summaryWh(m, "high").toPrecision(3)} Wh` : "—");
    console.log(`\nEnergy per ${SUMMARY_UNITS} units (tokens or audio seconds):`);
    for (const key of new Set([...Object.keys(before?.models ?? {}), ...Object.keys(after.models)])) {
        const was = fmt(before?.models?.[key]);
        const now = fmt(after.models[key]);
        console.log(`  ${key}\n    ${was === now ? now : `${was}  →  ${now}`}`);
    }
}

const current = readCurrent();

if (args.includes("--check")) {
    const latest = await latestVersion();
    const pinned = current?.ecologitsVersion ?? "none";
    if (pinned === latest) {
        console.log(`EcoLogits ${pinned} is the latest release.`);
    } else {
        console.log(`EcoLogits ${latest} is available (committed table uses ${pinned}). Run: npm run footprint:update`);
        process.exitCode = 1;
    }
} else {
    if (spawnSync("uv", ["--version"], { stdio: "ignore" }).status !== 0) {
        console.error("uv is required: https://docs.astral.sh/uv/getting-started/installation/");
        process.exit(1);
    }
    const version = versionArg ?? (await latestVersion());
    console.log(`Exporting with EcoLogits ${version}…`);
    execFileSync(
        "uv",
        ["run", "--quiet", "--no-project", "--with", `ecologits==${version}`,
            "python", exportScript, "--expect-version", version, "--out", outFile],
        { stdio: "inherit", cwd: root },
    );
    printSummary(current, readCurrent());
    console.log("\nReview the diff of shared/footprint/ecologits.json, then run the server tests.");
}
