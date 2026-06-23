import { useCallback, useEffect, useState } from "react";
import {
  APP_MODE_CHANGE_EVENT,
  APP_MODE_STORAGE_KEY,
  PUSH_TO_TALK_CHANGE_EVENT,
  PUSH_TO_TALK_STORAGE_KEY,
  getAppMode,
  getPushToTalk,
  setAppMode as persistAppMode,
  setPushToTalk as persistPushToTalk,
  type AppMode,
} from "./councilSettings";

export function useCouncilSettings(): {
  mode: AppMode;
  isMuseumMode: boolean;
  setAppMode: (mode: AppMode) => void;
  pushToTalkMode: boolean;
  setPushToTalkMode: (enabled: boolean) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);
  const [pushToTalkMode, setPushToTalkModeState] = useState(getPushToTalk);

  useEffect(() => {
    function onAppModeChange(event: Event): void {
      const next = (event as CustomEvent<AppMode>).detail;
      setMode(next);
    }

    function onPushToTalkChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setPushToTalkModeState(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === APP_MODE_STORAGE_KEY) {
        setMode(getAppMode());
      }
      if (event.key === PUSH_TO_TALK_STORAGE_KEY) {
        setPushToTalkModeState(getPushToTalk());
      }
    }

    window.addEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setAppMode = useCallback((next: AppMode) => {
    persistAppMode(next);
    setMode(next);
  }, []);

  const setPushToTalkMode = useCallback((enabled: boolean) => {
    persistPushToTalk(enabled);
    setPushToTalkModeState(enabled);
  }, []);

  return {
    mode,
    isMuseumMode: mode === "museum",
    setAppMode,
    pushToTalkMode,
    setPushToTalkMode,
  };
}
