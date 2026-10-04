import { HEALTH_RETRY_MS, probeOriginHealth } from "@/health";

/**
 * How the meter screen keeps itself fresh, unattended, for months: it reloads after the server
 * comes back (which is also how it picks up a deploy), after a crash, and every night. Always
 * through `reloadWhenHealthy`, so it never reloads into the browser's error page.
 */

/** The local hour the meter reloads itself every night, when nobody is watching. */
export const NIGHTLY_RELOAD_HOUR = 4;

/** Reloads the page once the server answers, asking again every `HEALTH_RETRY_MS` until it does. */
export async function reloadWhenHealthy(): Promise<void> {
  while (!(await probeOriginHealth())) {
    await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_MS));
  }
  window.location.reload();
}

/** Time from `now` to the next `NIGHTLY_RELOAD_HOUR`, local time. */
export function msUntilNightlyReload(now: Date): number {
  const next = new Date(now);
  next.setHours(NIGHTLY_RELOAD_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function scheduleNightlyReload(): void {
  setTimeout(() => void reloadWhenHealthy(), msUntilNightlyReload(new Date()));
}
