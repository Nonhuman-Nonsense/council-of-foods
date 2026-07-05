import type translation from "./locales/translation_en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    keySeparator: ".";
    nsSeparator: ":";
    resources: {
      translation: typeof translation;
    };
  }
}
