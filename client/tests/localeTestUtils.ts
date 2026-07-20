import fs from "node:fs";
import path from "node:path";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";

/** Absolute path to `client/src/locales` (tests run from the client package root). */
export const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");

export type TranslationTree = Record<string, unknown>;

/** Flatten nested locale JSON into dot-separated leaf keys (e.g. `app.start`). */
export function flattenTranslationKeys(
  tree: TranslationTree,
  prefix = "",
): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenTranslationKeys(value as TranslationTree, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

export function localeFilePath(lang: string): string {
  return path.join(LOCALES_DIR, `translation_${lang}.json`);
}

export function loadLocale(lang: string): TranslationTree {
  const filePath = localeFilePath(lang);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TranslationTree;
}

export function loadLocaleKeySet(lang: string): Set<string> {
  return new Set(flattenTranslationKeys(loadLocale(lang)));
}

const STAFF_BRIDGE_STATUSES = ["checking", "running", "notRunning", "error"] as const;
const STAFF_APP_STATUSES = ["disconnected", "connecting", "connected", "error", "unavailable"] as const;
const STAFF_USB_STATUSES = ["connected", "checking", "notDetected", "wrongDevice", "unavailable"] as const;
const STAFF_LOG_CATEGORIES = ["API", "SOCKET", "AGENT", "REALTIME", "BUTTON", "META", "AUTOPLAY", "SYSTEM", "ERROR"] as const;
const STAFF_BUTTON_OWNERS = ["none", "staff", "autoplay", "setup-agent", "human-input", "meta-agent"] as const;

const STATIC_USED_KEYS = [
  "about.label",
  "contact.label",
  "settings",
  ...STAFF_BRIDGE_STATUSES.map((status) => `staff.button.bridge.${status}`),
  ...STAFF_APP_STATUSES.map((status) => `staff.button.app.${status}`),
  ...STAFF_USB_STATUSES.map((status) => `staff.button.usb.${status}`),
  ...STAFF_LOG_CATEGORIES.map((category) => `staff.logging.categories.${category}`),
  ...STAFF_BUTTON_OWNERS.map((owner) => `staff.button.owners.${owner}`),
] as const;

function walkSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build"].includes(entry.name)) continue;
      walkSourceFiles(fullPath, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Collect i18n keys referenced from client source (`t()`, `i18nKey`, `messageKey`). */
export function collectUsedTranslationKeys(srcRoot = path.resolve(process.cwd(), "src")): Set<string> {
  const keys = new Set<string>(STATIC_USED_KEYS);

  for (const lang of AVAILABLE_LANGUAGES) {
    keys.add(lang);
  }

  const keyPatterns = [
    /\bt\(\s*['"`]([^'"`]+)['"`]/g,
    /i18nKey=['"`]([^'"`]+)['"`]/g,
    /messageKey:\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const filePath of walkSourceFiles(srcRoot)) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const pattern of keyPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const key = match[1];
        // Dynamic template keys are expanded via STATIC_USED_KEYS above.
        if (key.includes("${")) continue;
        keys.add(key);
      }
    }
  }

  return keys;
}

/** i18next plural keys resolve via `key_one` / `key_other` suffixes on the same path. */
export function translationKeyExists(key: string, localeKeys: Set<string>): boolean {
  if (localeKeys.has(key)) return true;

  const pluralRoot = key.replace(/_(\d+|zero|one|two|few|many|other)$/, "");
  if (pluralRoot !== key) {
    return localeKeys.has(pluralRoot);
  }

  const pluralOne = `${key}_one`;
  const pluralOther = `${key}_other`;
  if (localeKeys.has(pluralOne) || localeKeys.has(pluralOther)) {
    return localeKeys.has(pluralOne) && localeKeys.has(pluralOther);
  }

  return false;
}
