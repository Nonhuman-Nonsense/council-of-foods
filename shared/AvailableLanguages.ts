export const AVAILABLE_LANGUAGES = ["en"] as const;

export type AvailableLanguage = typeof AVAILABLE_LANGUAGES[number];

export const GOOGLE_LANGUAGE_MAP: Record<string, string> = {
    'en': 'en-GB',
    'sv': 'sv-SE'
};

export const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN'] as const;

/**
 * Maps ISO 3166-1 alpha-2 country codes (as set by Cloudflare's CF-IPCountry header)
 * to a preferred language code. Entries are only applied when the target language
 * is present in AVAILABLE_LANGUAGES — safe to keep across single- and multi-language
 * deployments.
 */
export const COUNTRY_DEFAULT_LANGUAGE: Record<string, string> = {
    'SE': 'sv',
};

export function resolvePreferredLanguageFromCountry(
    countryCode: string | undefined,
    languages: readonly string[] = AVAILABLE_LANGUAGES,
): AvailableLanguage | undefined {
    if (!countryCode) {
        return undefined;
    }

    const preferred = COUNTRY_DEFAULT_LANGUAGE[countryCode.toUpperCase()];
    if (!preferred) {
        return undefined;
    }

    return (languages as readonly string[]).includes(preferred)
        ? (preferred as AvailableLanguage)
        : undefined;
}
