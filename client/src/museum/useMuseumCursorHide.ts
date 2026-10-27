import { useEffect } from "react";
import { useLocation } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";
import { startCursorAutoHide } from "@/cursorAutoHide";

/**
 * Hides the pointer after idle time where the mode hides it (the `cursorHide` capability). Pauses
 * while #staff is open, and shows the pointer again when the mode stops hiding it.
 */
export function useMuseumCursorHide(): void {
  const { capabilities } = useCouncilSettings();
  const { hash } = useLocation();

  const active = capabilities.cursorHide && hash !== "#staff";

  useEffect(() => {
    if (!active) return;
    return startCursorAutoHide();
  }, [active]);
}
