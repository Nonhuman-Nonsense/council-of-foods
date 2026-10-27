/**
 * Hides the pointer on a kiosk screen once it has stood still, and shows it again when it moves,
 * so staff can still use a mouse. Imports nothing, for the council and the meter. macOS applies the
 * hidden cursor only while the page's Chrome is the app in front; museum/kiosk/kiosk-window.sh
 * sees to that.
 */

/** How long the pointer stands still before it hides. */
export const CURSOR_IDLE_MS = 3_000;

/** On `<html>` while the pointer is hidden; each page's stylesheet sets `cursor: none` under it. */
export const CURSOR_HIDDEN_CLASS = "cursor-hidden";

/** Starts hiding the pointer after `CURSOR_IDLE_MS` without movement. Returns a stop that shows it. */
export function startCursorAutoHide(): () => void {
  const root = document.documentElement;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleHide = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.add(CURSOR_HIDDEN_CLASS), CURSOR_IDLE_MS);
  };
  const onPointerMove = (): void => {
    root.classList.remove(CURSOR_HIDDEN_CLASS);
    scheduleHide();
  };

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  scheduleHide();

  return () => {
    clearTimeout(timer);
    document.removeEventListener("pointermove", onPointerMove);
    root.classList.remove(CURSOR_HIDDEN_CLASS);
  };
}
