import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";

/** Idle window before hiding the pointer in museum mode. */
export const MUSEUM_CURSOR_IDLE_MS = 3_000;

export const MUSEUM_CURSOR_HIDDEN_CLASS = "museum-cursor-hidden";

function showCursor(): void {
  document.documentElement.classList.remove(MUSEUM_CURSOR_HIDDEN_CLASS);
}

function hideCursor(): void {
  document.documentElement.classList.add(MUSEUM_CURSOR_HIDDEN_CLASS);
}

/**
 * Hides the pointer after idle time in museum mode. Re-shows on movement, then
 * hides again after the idle window. Pauses while #staff is open. Cleans up
 * when museum mode is disabled.
 */
export function useMuseumCursorHide(): void {
  const { isMuseumMode } = useCouncilSettings();
  const { hash } = useLocation();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = isMuseumMode && hash !== "#staff";

  useEffect(() => {
    if (!active) {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      showCursor();
      return;
    }

    const scheduleHide = (): void => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        hideCursor();
      }, MUSEUM_CURSOR_IDLE_MS);
    };

    const onPointerMove = (): void => {
      showCursor();
      scheduleHide();
    };

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    scheduleHide();

    return () => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      document.removeEventListener("pointermove", onPointerMove);
      showCursor();
    };
  }, [active]);
}
