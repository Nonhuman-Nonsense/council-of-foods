import { AVAILABLE_LANGUAGES } from "@shared/AvailableLanguages";
import routes from "@/routes.json";

export function newMeetingPath(lang: string): string {
  return `${getBasePath(lang)}/${routes.newMeeting}`;
}

export function meetingPath(lang: string, meetingId: number): string {
  return `${getBasePath(lang)}/${routes.meeting}/${meetingId}`;
}

export function getBasePath(lang: string): string {
  return (AVAILABLE_LANGUAGES as readonly string[]).length === 1 ? "" : `/${lang}`;
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

