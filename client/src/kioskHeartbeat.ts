/**
 * Shows the kiosk window's watchdog (museum/kiosk/kiosk-window.sh) that this page is alive: a
 * counter in the title, ticking while the page's code runs. A crashed or hung page, or Chrome's
 * error page in its place, stops it, and the watchdog restarts Chrome. Outside React, so it keeps
 * ticking while the page handles its own errors. Imports nothing, for the council and the meter.
 */

export const HEARTBEAT_MS = 10_000;

/** Ticks while `isOn()`; otherwise leaves the page's own title. */
export function startKioskHeartbeat(isOn: () => boolean): void {
  const title = document.title;
  let beat = 0;
  setInterval(() => {
    document.title = isOn() ? `${title} · ${++beat}` : title;
  }, HEARTBEAT_MS);
}
