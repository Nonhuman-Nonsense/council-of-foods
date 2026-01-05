/// <reference types="vite/client" />
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";

// Eagerly import all translation files to bundle them
const locales = import.meta.glob('/src/locales/*/*.json', { eager: true, import: 'default' });

// Construct the resources object dynamically
const resources: Record<string, any> = {};

for (const path in locales) {
  // Path format: /src/locales/{lang}/{ns}.json
  // Example: /src/locales/en/translation.json
  const parts = path.split('/');
  const lang = parts[parts.length - 2];
  const ns = parts[parts.length - 1].replace('.json', '');

  if (!resources[lang]) {
    resources[lang] = {};
  }

  resources[lang][ns] = locales[path];
}

for (const lang of AVAILABLE_LANGUAGES) {
  if (!resources[lang]) {
    throw new Error(`Missing translations for language: ${lang}. Make sure client/src/locales/${lang} exists and contains json files.`);
  }
}

/**
 * i18n Configuration
 * 
 * Sets up internationalization using i18next.
 * Translations are now BUNDLED (no HttpBackend) via import.meta.glob.
 */
i18n
  .use(initReactI18next) // pass i18n to react-i18next
  .init({
    resources, // bundled resources
    lng: AVAILABLE_LANGUAGES[0], // force initial language (optional, but good for single-lang start)
    fallbackLng: AVAILABLE_LANGUAGES[0], // fallback language
    debug: import.meta.env.DEV, // show logs
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;
