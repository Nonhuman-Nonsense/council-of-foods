import { useCallback, useEffect, useState } from "react";
import {
  BUTTON_LED_DEBUG_CHANGE_EVENT,
  BUTTON_LED_DEBUG_STORAGE_KEY,
  getButtonLedDebugOverlay,
  setButtonLedDebugOverlay as persistButtonLedDebugOverlay,
} from "./buttonLedDebug";

export function useButtonLedDebugOverlay(): {
  ledDebugOverlay: boolean;
  setLedDebugOverlay: (enabled: boolean) => void;
} {
  const [ledDebugOverlay, setLedDebugOverlayState] = useState(getButtonLedDebugOverlay);

  useEffect(() => {
    function onChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setLedDebugOverlayState(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === BUTTON_LED_DEBUG_STORAGE_KEY) {
        setLedDebugOverlayState(getButtonLedDebugOverlay());
      }
    }

    window.addEventListener(BUTTON_LED_DEBUG_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BUTTON_LED_DEBUG_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLedDebugOverlay = useCallback((enabled: boolean) => {
    persistButtonLedDebugOverlay(enabled);
    setLedDebugOverlayState(enabled);
  }, []);

  return { ledDebugOverlay, setLedDebugOverlay };
}
