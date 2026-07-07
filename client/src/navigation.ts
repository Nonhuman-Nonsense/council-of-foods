import i18n from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import routes from "@/routes.json";
import { setUnrecoverableError, useErrorStore } from "@main/overlay/errorStore";
import { getAppMode } from "@/settings/councilSettings";

const APP_ROOT = "/";

function basePath(lang: string): string {
  return (AVAILABLE_LANGUAGES as readonly string[]).length === 1 ? "" : `/${lang}`;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function stripLanguagePrefix(pathname: string): string {
  const languagePattern = AVAILABLE_LANGUAGES.join("|");
  return pathname.replace(
    new RegExp(`^/(?:${languagePattern})(?=/|$)`),
    "",
  );
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

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Museum kiosk health + guarded reload
// ---------------------------------------------------------------------------

export const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** Museum kiosk: wait between failed health probes / restart countdowns. */
export const MUSEUM_HEALTH_RETRY_MS = 10_000;
export const MUSEUM_HEALTH_RETRY_SECONDS = MUSEUM_HEALTH_RETRY_MS / 1_000;

/** Museum kiosk: true when same-origin GET /health returns 200. */
export async function probeOriginHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch("/health", {
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Hard-reload at `targetPath`. In museum mode, probes `/health` first.
 * On failure, escalates to `CouncilError` when not already shown.
 */
async function guardedReload(targetPath: string): Promise<boolean> {
  if (getAppMode() !== "museum") {
    window.location.href = targetPath;
    return true;
  }

  if (!(await probeOriginHealth())) {
    if (useErrorStore.getState().unrecoverableError == null) {
      setUnrecoverableError({ message: "Reconnect failed", source: "reload" });
    }
    return false;
  }

  window.location.href = targetPath;
  return true;
}

/**
 * Hard-reload the app. Museum mode resets to `/` (default language) after a
 * health probe; web mode reloads the current language root.
 */
export async function reloadApp(): Promise<boolean> {
  const targetPath = getAppMode() === "museum" ? APP_ROOT : `${basePath(i18n.language)}/`;
  return guardedReload(targetPath);
}

/**
 * Navigate to the app root immediately, without a health probe.
 * Use for manual user-initiated restarts where "just reload" is the right
 * behaviour regardless of server state.
 */
export function restartNow(): void {
  const targetPath = getAppMode() === "museum" ? APP_ROOT : `${basePath(i18n.language)}/`;
  window.location.href = targetPath;
}
