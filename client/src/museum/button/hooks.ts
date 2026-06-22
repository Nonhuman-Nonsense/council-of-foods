import { useEffect } from "react";
import type { ButtonLedMode } from "@/voice/buttonLedMode";
import { useButtonStore } from "@stores/useButtonStore";
import type { ButtonLedOwner } from "./buttonLedIntent";

/** Declare desired LED mode for a screen; highest-priority active owner wins. */
export function useButtonLed(owner: ButtonLedOwner, mode: ButtonLedMode, active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    useButtonStore.getState().registerLedIntent(owner, mode);
    return () => {
      useButtonStore.getState().registerLedIntent(owner, null);
    };
  }, [owner, mode, active]);
}
