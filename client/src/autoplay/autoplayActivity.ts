import { log } from "@/logger";

let lastActivityMs = Date.now();

/** Reset the autoplay idle clock (voice guide, navigation, button, etc.). */
export function bumpAutoplayActivity(source?: string): void {
  lastActivityMs = Date.now();
  if (source) {
    log.event("AUTOPLAY", "activity bump", { source });
  }
}

export function getAutoplayLastActivityMs(): number {
  return lastActivityMs;
}

/** Test helper — pin the idle clock. */
export function _setAutoplayLastActivityMsForTests(ms: number): void {
  lastActivityMs = ms;
}
