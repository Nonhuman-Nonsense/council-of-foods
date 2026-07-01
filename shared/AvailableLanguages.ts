export const AVAILABLE_LANGUAGES = ["en"] as const;

/**
 * Maps ISO 3166-1 alpha-2 country codes (CF-IPCountry) to a preferred language.
 * Only include entries for languages in AVAILABLE_LANGUAGES — TypeScript enforces this.
 * On single-language deployments (e.g. Foods) leave this empty.
 */
export const COUNTRY_DEFAULT_LANGUAGE: Partial<Record<string, AvailableLanguage>> = {
};

export type AvailableLanguage = typeof AVAILABLE_LANGUAGES[number];

export const GOOGLE_LANGUAGE_MAP: Record<string, string> = {
    'en': 'en-GB',
    'sv': 'sv-SE'
};

export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN'] as const;


