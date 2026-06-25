import { useCallback, useEffect, useState } from "react";
import {
  APP_MODE_CHANGE_EVENT,
  APP_MODE_STORAGE_KEY,
  DEV_LOG_CHANGE_EVENT,
  DEV_LOG_DISABLED_CATEGORIES_KEY,
  DEV_LOG_ENABLED_KEY,
  DEV_LOG_CATEGORIES,
  PUSH_TO_TALK_CHANGE_EVENT,
  PUSH_TO_TALK_STORAGE_KEY,
  getAppMode,
  getDevLogCategoryStates,
  getDevLogEnabled,
  getPushToTalk,
  setAppMode as persistAppMode,
  setAllDevLogCategories,
  setDevLogCategoryEnabled,
  setDevLogEnabled as persistDevLogEnabled,
  setPushToTalk as persistPushToTalk,
  type AppMode,
  type LogCategory,
} from "./councilSettings";

export function useCouncilSettings(): {
  mode: AppMode;
  isMuseumMode: boolean;
  setAppMode: (mode: AppMode) => void;
  pushToTalkMode: boolean;
  setPushToTalkMode: (enabled: boolean) => void;
  devLogEnabled: boolean;
  setDevLogEnabled: (enabled: boolean) => void;
  devLogCategories: Record<LogCategory, boolean>;
  setDevLogCategoryEnabled: (category: LogCategory, enabled: boolean) => void;
  setAllDevLogCategories: (enabled: boolean) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);
  const [pushToTalkMode, setPushToTalkModeState] = useState(getPushToTalk);
  const [devLogEnabled, setDevLogEnabledState] = useState(getDevLogEnabled);
  const [devLogCategories, setDevLogCategoriesState] = useState(getDevLogCategoryStates);

  const refreshDevLogSettings = useCallback(() => {
    setDevLogEnabledState(getDevLogEnabled());
    setDevLogCategoriesState(getDevLogCategoryStates());
  }, []);

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
      if (
        event.key === DEV_LOG_ENABLED_KEY ||
        event.key === DEV_LOG_DISABLED_CATEGORIES_KEY
      ) {
        refreshDevLogSettings();
      }
    }

    function onDevLogChange(): void {
      refreshDevLogSettings();
    }

    window.addEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    window.addEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
      window.removeEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshDevLogSettings]);

  const setAppMode = useCallback((next: AppMode) => {
    persistAppMode(next);
    setMode(next);
  }, []);

  const setPushToTalkMode = useCallback((enabled: boolean) => {
    persistPushToTalk(enabled);
    setPushToTalkModeState(enabled);
  }, []);

  const setDevLogEnabled = useCallback((enabled: boolean) => {
    persistDevLogEnabled(enabled);
    setDevLogEnabledState(enabled);
    setDevLogCategoriesState(getDevLogCategoryStates());
  }, []);

  const setDevLogCategory = useCallback((category: LogCategory, enabled: boolean) => {
    setDevLogCategoryEnabled(category, enabled);
    refreshDevLogSettings();
  }, [refreshDevLogSettings]);

  const setAllCategories = useCallback((enabled: boolean) => {
    setAllDevLogCategories(enabled);
    refreshDevLogSettings();
  }, [refreshDevLogSettings]);

  return {
    mode,
    isMuseumMode: mode === "museum",
    setAppMode,
    pushToTalkMode,
    setPushToTalkMode,
    devLogEnabled,
    setDevLogEnabled,
    devLogCategories,
    setDevLogCategoryEnabled: setDevLogCategory,
    setAllDevLogCategories: setAllCategories,
  };
}

export { DEV_LOG_CATEGORIES };
