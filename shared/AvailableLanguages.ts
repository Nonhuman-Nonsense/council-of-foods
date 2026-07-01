export const AVAILABLE_LANGUAGES = ["en"] as const;

/**
 * Maps ISO 3166-1 alpha-2 country codes (CF-IPCountry) to a preferred language.
 * Only include entries for languages in AVAILABLE_LANGUAGES — TypeScript enforces this.
 * On single-language deployments (e.g. Foods) leave this empty.
 */
export const COUNTRY_DEFAULT_LANGUAGE: Partial<Record<string, AvailableLanguage>> = {
};

export type AvailableLanguage = typeof AVAILABLE_LANGUAGES[number];


