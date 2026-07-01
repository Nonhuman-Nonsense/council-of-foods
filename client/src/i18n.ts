/// <reference types="vite/client" />
import i18n from 'i18next';
import type { Resource, ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";

// Flat locale files: src/locales/translation_{lang}.json → namespace "translation"
const locales = import.meta.glob('/src/locales/translation_*.json', {
  eager: true,
  import: 'default',
});

const resources: Resource = {};

for (const path in locales) {
  const match = path.match(/\/locales\/translation_([^/]+)\.json$/);
  if (!match) continue;

  const lang = match[1];
  const ns = 'translation';

  if (!resources[lang]) {
    resources[lang] = {};
  }

  resources[lang][ns] = locales[path] as ResourceKey;
}

for (const lang of AVAILABLE_LANGUAGES) {
  if (!resources[lang]) {
    throw new Error(
      `Missing translations for language: ${lang}. Expected client/src/locales/translation_${lang}.json`,
    );
  }
}

function resolveInitialLanguage(): string {
  const fallbackLanguage = AVAILABLE_LANGUAGES[0];
  if (typeof window === "undefined") {
    return fallbackLanguage;
  }

  const pathname = window.location.pathname;
  const matchedLanguage = (AVAILABLE_LANGUAGES as readonly string[]).find((lang) =>
    pathname === `/${lang}` || pathname.startsWith(`/${lang}/`)
  );

  return matchedLanguage ?? fallbackLanguage;
}

/**
 * i18n Configuration
 *
 * Sets up internationalization using i18next.
 * Translations are now BUNDLED (no HttpBackend) via import.meta.glob.
 */
i18n
  .use(initReactI18next) // pass the instance to react-i18next
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: AVAILABLE_LANGUAGES[0],
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
