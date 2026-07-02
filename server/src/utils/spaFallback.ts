import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages.js";

const BLOCKED_PREFIXES = [
    "/.git",
    "/.svn",
    "/.hg",
    "/wp-admin",
    "/wp-content",
    "/wp-includes",
    "/vendor",
    "/cgi-bin",
    "/boaform",
    "/socket.io",
    "/api",
] as const;

const BLOCKED_EXACT_PATHS = new Set([
    "/.env",
    "/xmlrpc.php",
    "/v1/models",
    "/v1/embeddings",
    "/v1/completions",
]);

const BLOCKED_EXTENSION_PATTERN = /\.(?:php\d*|phtml|phar|asp|aspx|jsp|cgi|pl|py|sh|lua|env|ini|log|bak|old|sql|conf|config|ya?ml|toml|zip|tar|gz|tgz|7z|rar)$/i;
const NEW_MEETING_ROUTE_PATTERN = /^\/new\/?$/;
const MEETING_ROUTE_PATTERN = /^\/meeting\/\d+\/?$/;
const UNKNOWN_LANGUAGE_PREFIX_PATTERN = /^\/[a-z]{2}(?=\/|$)/i;

function isValidSpaRoutePath(routePath: string): boolean {
    return routePath === "/"
        || NEW_MEETING_ROUTE_PATTERN.test(routePath)
        || MEETING_ROUTE_PATTERN.test(routePath);
}

function buildLanguagePrefixedPath(lang: string, routePath: string): string {
    if (routePath === "/" || routePath === "") {
        return `/${lang}/`;
    }

    const normalizedRoute = routePath.replace(/\/$/, "") || "/";
    if (normalizedRoute === "/") {
        return `/${lang}/`;
    }

    return `/${lang}${normalizedRoute}`;
}

function normalizePathname(pathname: string): string {
    if (!pathname) {
        return "/";
    }

    const normalized = pathname.replace(/\/{2,}/g, "/");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAllowedLanguagePrefix(
    pathname: string,
    languages: readonly string[],
): string | null {
    if (languages.length <= 1) {
        return pathname;
    }

    if (pathname === "/") {
        return "/";
    }

    const languagePattern = languages.map(escapeRegex).join("|");
    const languagePrefixPattern = new RegExp(`^/(?:${languagePattern})(?=/|$)`);
    const stripped = pathname.replace(languagePrefixPattern, "");

    if (stripped === pathname) {
        return null;
    }

    return stripped === "" ? "/" : stripped;
}

export function isBlockedScannerPath(pathname: string): boolean {
    const normalized = normalizePathname(pathname);

    if (BLOCKED_EXACT_PATHS.has(normalized)) {
        return true;
    }

    if (BLOCKED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
        return true;
    }

    if (normalized.startsWith("/.") && !normalized.startsWith("/.well-known/")) {
        return true;
    }

    return BLOCKED_EXTENSION_PATTERN.test(normalized);
}

export function shouldServeSpaShell(
    pathname: string,
    languages: readonly string[] = AVAILABLE_LANGUAGES,
): boolean {
    const normalized = normalizePathname(pathname);

    if (isBlockedScannerPath(normalized)) {
        return false;
    }

    const routePath = stripAllowedLanguagePrefix(normalized, languages);
    if (routePath == null) {
        return false;
    }

    return isValidSpaRoutePath(routePath);
}

function extractRoutePathForRedirect(
    pathname: string,
    languages: readonly string[],
): string | null {
    const normalized = normalizePathname(pathname);
    const allowedRoutePath = stripAllowedLanguagePrefix(normalized, languages);

    if (allowedRoutePath != null) {
        return allowedRoutePath;
    }

    if (isValidSpaRoutePath(normalized)) {
        return normalized;
    }

    const withoutUnknownLang = normalized.replace(UNKNOWN_LANGUAGE_PREFIX_PATTERN, "");
    const unknownLangRoutePath = withoutUnknownLang === "" ? "/" : withoutUnknownLang;
    if (unknownLangRoutePath !== normalized && isValidSpaRoutePath(unknownLangRoutePath)) {
        return unknownLangRoutePath;
    }

    return null;
}

function extractLanguagePrefix(
    pathname: string,
    languages: readonly string[],
): string | null {
    const normalized = normalizePathname(pathname);

    for (const lang of languages) {
        if (normalized === `/${lang}` || normalized.startsWith(`/${lang}/`)) {
            return lang;
        }
    }

    return null;
}

/** Landing path for invalid user-facing SPA routes (not scanner probes).
 *
 * @param preferredLang - caller-supplied language hint (e.g. derived from
 *   the CF-IPCountry header). Only used when the pathname carries no
 *   existing language prefix; ignored if not in the languages list.
 */
export function getSpaRedirectTarget(
    pathname: string,
    languages: readonly string[] = AVAILABLE_LANGUAGES,
    preferredLang?: string,
): string {
    if (languages.length <= 1) {
        return "/";
    }

    const normalized = normalizePathname(pathname);
    const existingLang = extractLanguagePrefix(normalized, languages);
    const defaultLang =
        preferredLang && (languages as readonly string[]).includes(preferredLang)
            ? preferredLang
            : languages[0];
    const routePath = extractRoutePathForRedirect(normalized, languages);

    if (existingLang) {
        if (routePath != null && isValidSpaRoutePath(routePath)) {
            return buildLanguagePrefixedPath(existingLang, routePath);
        }

        return `/${existingLang}/`;
    }

    if (routePath != null && isValidSpaRoutePath(routePath)) {
        return buildLanguagePrefixedPath(defaultLang, routePath);
    }

    return `/${defaultLang}/`;
}
