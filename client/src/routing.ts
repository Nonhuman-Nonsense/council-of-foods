import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import routes from "@/routes.json";

function basePath(lang: string): string {
  return (AVAILABLE_LANGUAGES as readonly string[]).length === 1 ? "" : `/${lang}`;
}

/**
 * Navigate to another available language, preserving the current route and hash.
 */
export function useSwitchLanguage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentLang = i18n.language;
  const canSwitchLanguage = AVAILABLE_LANGUAGES.length > 1;
  const otherLanguages = canSwitchLanguage
    ? (AVAILABLE_LANGUAGES as readonly string[]).filter((lang) => lang !== currentLang)
    : [];

  const switchLanguage = useCallback(
    (targetLang: string) => {
      if (!(AVAILABLE_LANGUAGES as readonly string[]).includes(targetLang)) {
        return;
      }
      if (targetLang === currentLang) {
        return;
      }
      navigate(buildLanguagePath(targetLang, location.pathname, location.hash));
    },
    [currentLang, location.hash, location.pathname, navigate],
  );

  return { switchLanguage, otherLanguages, canSwitchLanguage, currentLang };
}

/**
 * Build a path that switches to `targetLang` while preserving the current route and hash.
 * In single-language deployments, returns the path without a language prefix.
 */
export function buildLanguagePath(targetLang: string, pathname: string, hash = ""): string {
  const hashSuffix = hash.startsWith("#") ? hash : hash ? `#${hash}` : "";
  const pathWithoutLang = stripLanguagePrefix(pathname).replace(/^\//, "");
  if ((AVAILABLE_LANGUAGES as readonly string[]).length === 1) {
    const path = pathWithoutLang.length > 0 ? `/${pathWithoutLang}` : "/";
    return `${path}${hashSuffix}`;
  }
  const pathSegment = pathWithoutLang.length > 0 ? `/${pathWithoutLang}` : "/";
  return `/${targetLang}${pathSegment}${hashSuffix}`;
}

/**
 * Hook returning path helpers bound to the current i18n language.
 * Use this instead of passing `lang` through component props.
 */
export function useRouting() {
  const { i18n } = useTranslation();
  const base = basePath(i18n.language);
  return {
    rootPath: `${base}/`,
    newMeetingPath: `${base}/${routes.newMeeting}`,
    meetingPath: (meetingId: number) => `${base}/${routes.meeting}/${meetingId}`,
    meetingRoutesBase: `${base}/${routes.meeting}`,
  };
}

export function stripLanguagePrefix(pathname: string): string {
  const languagePattern = AVAILABLE_LANGUAGES.join("|");
  return pathname.replace(
    new RegExp(`^/(?:${languagePattern})(?=/|$)`),
    ""
  );
}

export function isMeetingPath(pathname: string): boolean {
  return stripLanguagePrefix(pathname).startsWith(`/${routes.meeting}`);
}

/** Numeric id from `/meeting/:meetingId` (after language prefix strip). */
export function getMeetingIdFromPathname(pathname: string): string | undefined {
  const withoutLang = stripLanguagePrefix(pathname);
  const m = withoutLang.match(new RegExp(`^/${routes.meeting}/(\\d+)(?:/|$)`));
  return m?.[1];
}

export function isRootPath(pathname: string): boolean {
  const pathWithoutLangPrefix = stripLanguagePrefix(pathname);
  return pathWithoutLangPrefix === "" || pathWithoutLangPrefix === "/";
}
