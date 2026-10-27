/**
 * Renders a print run of letters (server/scripts/letters/printLetters.ts writes letters.json) as
 * one PDF per letter, with the app's own print layout: harness.tsx is built with the client's
 * Vite config and opened in headless Chromium, served from memory — no dev server, no port.
 *
 *   node scripts/printLetters/render.mts [--letters ../server/scripts/letters/print-out/letters.json]
 *                                        [--out ../server/scripts/letters/print-out/pdf]
 *                                        [--site <url>]   (where the QR codes lead; default the server's letterSiteUrl)
 *                                        [--chrome <path>]   (a Chromium to use when Playwright's own is missing)
 *
 * Also renders replies (PrintableLetterReply, as LetterReplyPrinter prints them):
 *   node scripts/printLetters/render.mts --letters <replies.json> --out <dir>
 * — any item with a `kind` is a reply.
 *
 * Writes <out>/NN-<meetingId>-<language>.pdf, numbered in the order of the input file, and flags
 * every letter that runs past one page (they hang one sheet each).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build, loadConfigFromFile, type UserConfig } from "vite";
import { chromium } from "@playwright/test";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const clientDir = path.resolve(import.meta.dirname, "../..");
const LETTERS = path.resolve(arg("letters", path.join(clientDir, "../server/scripts/letters/print-out/letters.json")));
const OUT = path.resolve(arg("out", path.join(path.dirname(LETTERS), "pdf")));
const SITE = arg("site", "") || (JSON.parse(await readFile(path.join(clientDir, "../server/global-options.json"), "utf8")) as { letterSiteUrl: string }).letterSiteUrl;
const CHROME = arg("chrome", "");
const ORIGIN = "http://print.invalid";

interface PrintItem {
  meetingId: number;
  /** A letter's. */
  language?: string;
  /** A reply's: "reply" or "opt-out". */
  kind?: string;
  letter: { language?: string };
}

const letters = JSON.parse(await readFile(LETTERS, "utf8")) as PrintItem[];

// Build the harness with the app's own config (aliases, plugins), as its only page.
const buildDir = path.join(tmpdir(), `letter-print-${process.pid}`);
const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, path.join(clientDir, "vite.config.mts"));
const config = loaded!.config as UserConfig;
await build({
  ...config,
  configFile: false,
  root: clientDir,
  logLevel: "warn",
  resolve: {
    ...config.resolve,
    // tsconfig's paths cover src/ only, not this script's folder.
    alias: {
      ...(config.resolve?.alias as Record<string, string>),
      "@council": path.join(clientDir, "src/council"),
      "@": path.join(clientDir, "src"),
    },
  },
  build: {
    ...config.build,
    outDir: buildDir,
    emptyOutDir: true,
    rollupOptions: { input: { harness: path.join(clientDir, "scripts/printLetters/index.html") } },
  },
});

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(`[page] ${error.message}`));
  await page.route(`${ORIGIN}/**`, async (route) => {
    const file = path.join(buildDir, decodeURIComponent(new URL(route.request().url()).pathname));
    try {
      await route.fulfill({ path: file });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto(`${ORIGIN}/scripts/printLetters/index.html`);
  await page.waitForFunction(() => typeof window.letterPdf === "function");

  await mkdir(OUT, { recursive: true });
  const width = String(letters.length).length;
  const long: string[] = [];
  for (const [i, item] of letters.entries()) {
    const { base64, pages } = await page.evaluate(
      ([it, site]) => ("kind" in it ? window.replyPdf(it as never, site) : window.letterPdf(it as never, site)),
      [item, SITE] as const,
    );
    const language = item.language ?? item.letter.language;
    const name = `${String(i + 1).padStart(Math.max(2, width), "0")}-${item.meetingId}-${language}${item.kind ? `-${item.kind}` : ""}.pdf`;
    await writeFile(path.join(OUT, name), Buffer.from(base64, "base64"));
    if (pages > 1) long.push(`${name} (${pages} pages)`);
    console.log(`${pages > 1 ? "⚠" : "✔"} ${name}${pages > 1 ? ` — ${pages} pages` : ""}`);
  }
  console.log(`\n${letters.length} PDFs in ${OUT}`);
  if (long.length) console.log(`Longer than one page:\n  ${long.join("\n  ")}`);
} finally {
  await browser.close();
  await rm(buildDir, { recursive: true, force: true });
}
