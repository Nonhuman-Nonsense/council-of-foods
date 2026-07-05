// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import {
  LOCALES_DIR,
  collectUsedTranslationKeys,
  flattenTranslationKeys,
  loadLocale,
  loadLocaleKeySet,
  localeFilePath,
  translationKeyExists,
} from "../localeTestUtils";

describe("UI locale files", () => {
  it("has a translation JSON for every language in AVAILABLE_LANGUAGES", () => {
    for (const lang of AVAILABLE_LANGUAGES) {
      const filePath = localeFilePath(lang);
      expect(fs.existsSync(filePath), `Missing UI locale file for language: ${lang}`).toBe(true);

      const data = loadLocale(lang);
      expect(flattenTranslationKeys(data).length).toBeGreaterThan(0);
    }
  });

  it("uses the same translation keys across all AVAILABLE_LANGUAGES", () => {
    if (AVAILABLE_LANGUAGES.length < 2) return;

    const referenceLang = AVAILABLE_LANGUAGES[0];
    const referenceKeys = [...loadLocaleKeySet(referenceLang)].sort();

    for (const lang of AVAILABLE_LANGUAGES.slice(1)) {
      const otherKeys = [...loadLocaleKeySet(lang)].sort();

      const missingInOther = referenceKeys.filter((key) => !otherKeys.includes(key));
      const extraInOther = otherKeys.filter((key) => !referenceKeys.includes(key));

      expect(
        missingInOther,
        `Keys in "${referenceLang}" missing from "${lang}": ${missingInOther.join(", ")}`,
      ).toEqual([]);
      expect(
        extraInOther,
        `Keys in "${lang}" missing from "${referenceLang}": ${extraInOther.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("defines every translation key used in client source for each AVAILABLE_LANGUAGES entry", () => {
    const usedKeys = [...collectUsedTranslationKeys()].sort();

    for (const lang of AVAILABLE_LANGUAGES) {
      const localeKeys = loadLocaleKeySet(lang);
      const missing = usedKeys.filter((key) => !translationKeyExists(key, localeKeys));

      expect(
        missing,
        `Keys used in client/src but missing from translation_${lang}.json: ${missing.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("keeps locale files under client/src/locales", () => {
    expect(fs.existsSync(LOCALES_DIR)).toBe(true);
  });
});
