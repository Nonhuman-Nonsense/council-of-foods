import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import { useTranslation } from "react-i18next";
import routes from "@/routes.json";

function basePath(lang: string): string {
  return (AVAILABLE_LANGUAGES as readonly string[]).length === 1 ? "" : `/${lang}`;
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

export function isRootPath(pathname: string): boolean {
  const pathWithoutLangPrefix = stripLanguagePrefix(pathname);
  return pathWithoutLangPrefix === "" || pathWithoutLangPrefix === "/";
}
