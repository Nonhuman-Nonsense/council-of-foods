/**
 * Is the server up? Asked before an installation reloads itself, so it never reloads into the
 * browser's own "can't reach this site" page, which no code of ours can leave. Imports nothing,
 * so the council app and the meter can both use it.
 */

export const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** Wait between failed health probes / restart countdowns. */
export const HEALTH_RETRY_MS = 10_000;
export const HEALTH_RETRY_SECONDS = HEALTH_RETRY_MS / 1_000;

/** True when same-origin GET /health returns 200. */
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
