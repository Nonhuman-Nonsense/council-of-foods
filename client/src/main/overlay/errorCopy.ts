import type { TFunction } from "i18next";
import type { ClientErrorKey } from "@shared/SocketTypes";

/**
 * The server names what went wrong; the words are ours.
 *
 * Exhaustive by construction: add a `ClientErrorKey` on the server and this
 * map stops compiling until the client has copy for it. An unknown key — an
 * older client meeting a newer server — falls back to the server's own English
 * message rather than showing a raw key or nothing at all.
 */
const ERROR_COPY: Record<ClientErrorKey, string> = {
  invalidRequest: "error.invalidRequest",
  elsewhere: "error.elsewhere",
  // The fuller sentence, not the overlay's two-word heading: this one lands on
  // an error screen with nothing else to explain it.
  busy: "error.busyTerminal",
  notFound: "error.notFound",
  unauthorized: "error.unauthorized",
  forbidden: "error.forbidden",
  meetingComplete: "error.meetingComplete",
  invalidAudioId: "error.invalidAudioId",
  realtimeUnavailable: "error.realtimeUnavailable",
  // Genuinely unexpected: no useful words beyond the generic apology, and the
  // server's own message is internal prose. Handled by the caller's fallback.
  unexpected: "",
};

/**
 * Resolve the copy to show for a failure.
 *
 * Deliberately called at render time rather than when the error is stored:
 * switching language re-renders into the new one, and ErrorBot keeps receiving
 * the server's untranslated message.
 */
export function errorCopy(
  t: TFunction,
  errorKey: ClientErrorKey | undefined,
  fallback: string,
): string {
  const key = errorKey ? ERROR_COPY[errorKey] : undefined;
  if (!key) return fallback;
  return t(key as Parameters<TFunction>[0]) as string;
}
