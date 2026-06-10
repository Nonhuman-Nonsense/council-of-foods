import { useCallback, useEffect, useState } from "react";
import {
  APP_MODE_CHANGE_EVENT,
  APP_MODE_STORAGE_KEY,
  getAppMode,
  setAppMode as persistAppMode,
  type AppMode,
} from "./appMode";

export function useAppMode(): {
  mode: AppMode;
  isMuseumMode: boolean;
  setAppMode: (mode: AppMode) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);

  useEffect(() => {
    function onAppModeChange(event: Event): void {
      const next = (event as CustomEvent<AppMode>).detail;
      setMode(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === APP_MODE_STORAGE_KEY) {
        setMode(getAppMode());
      }
    }

    window.addEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setAppMode = useCallback((next: AppMode) => {
    persistAppMode(next);
    setMode(next);
  }, []);

  return {
    mode,
    isMuseumMode: mode === "museum",
    setAppMode,
  };
}
