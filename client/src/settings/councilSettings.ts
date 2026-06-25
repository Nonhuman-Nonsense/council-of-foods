import { useCallback, useEffect, useState } from "react";
import { DEV_LOG_CATEGORIES, type LogCategory } from "@/logger";

export { DEV_LOG_CATEGORIES, type LogCategory };

export const APP_MODE_STORAGE_KEY = "councilAppMode";

export const APP_MODE_CHANGE_EVENT = "council-app-mode-change";

export type AppMode = "web" | "museum";

export const PUSH_TO_TALK_STORAGE_KEY = "councilPushToTalk";

export const PUSH_TO_TALK_CHANGE_EVENT = "council-push-to-talk-change";

export type PushToTalkChangeDetail = boolean;

export const DEV_LOG_ENABLED_KEY = "councilDevLogEnabled";

export const DEV_LOG_DISABLED_CATEGORIES_KEY = "councilDevLogDisabledCategories";

export const DEV_LOG_CHANGE_EVENT = "council-dev-log-change";

export function getAppMode(): AppMode {
  try {
    return localStorage.getItem(APP_MODE_STORAGE_KEY) === "museum" ? "museum" : "web";
  } catch {
    return "web";
  }
}

export function setAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(new CustomEvent<AppMode>(APP_MODE_CHANGE_EVENT, { detail: mode }));
}

export function getPushToTalk(): boolean {
  try {
    return localStorage.getItem(PUSH_TO_TALK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPushToTalk(value: boolean): void {
  try {
    localStorage.setItem(PUSH_TO_TALK_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<PushToTalkChangeDetail>(PUSH_TO_TALK_CHANGE_EVENT, { detail: value }),
  );
}

function readDisabledDevLogCategories(): LogCategory[] {
  try {
    const raw = localStorage.getItem(DEV_LOG_DISABLED_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LogCategory =>
        typeof item === "string" && (DEV_LOG_CATEGORIES as readonly string[]).includes(item),
    );
  } catch {
    return [];
  }
}

function writeDisabledDevLogCategories(categories: LogCategory[]): void {
  try {
    localStorage.setItem(DEV_LOG_DISABLED_CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(DEV_LOG_CHANGE_EVENT));
}

/** Master dev console logging switch. Defaults to on in dev when unset. */
export function getDevLogEnabled(): boolean {
  try {
    const stored = localStorage.getItem(DEV_LOG_ENABLED_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
    return import.meta.env.DEV;
  } catch {
    return false;
  }
}

export function setDevLogEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DEV_LOG_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(DEV_LOG_CHANGE_EVENT));
}

export function isDevLogCategoryEnabled(category: LogCategory): boolean {
  return !readDisabledDevLogCategories().includes(category);
}

export function getDevLogCategoryStates(): Record<LogCategory, boolean> {
  const disabled = new Set(readDisabledDevLogCategories());
  return Object.fromEntries(
    DEV_LOG_CATEGORIES.map((category) => [category, !disabled.has(category)]),
  ) as Record<LogCategory, boolean>;
}

export function setDevLogCategoryEnabled(category: LogCategory, enabled: boolean): void {
  const disabled = new Set(readDisabledDevLogCategories());
  if (enabled) {
    disabled.delete(category);
  } else {
    disabled.add(category);
  }
  writeDisabledDevLogCategories([...disabled]);
}

export function setAllDevLogCategories(enabled: boolean): void {
  writeDisabledDevLogCategories(enabled ? [] : [...DEV_LOG_CATEGORIES]);
}

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

  const setAppModeFromHook = useCallback((next: AppMode) => {
    setAppMode(next);
    setMode(next);
  }, []);

  const setPushToTalkMode = useCallback((enabled: boolean) => {
    setPushToTalk(enabled);
    setPushToTalkModeState(enabled);
  }, []);

  const setDevLogEnabledFromHook = useCallback((enabled: boolean) => {
    setDevLogEnabled(enabled);
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
    setAppMode: setAppModeFromHook,
    pushToTalkMode,
    setPushToTalkMode,
    devLogEnabled,
    setDevLogEnabled: setDevLogEnabledFromHook,
    devLogCategories,
    setDevLogCategoryEnabled: setDevLogCategory,
    setAllDevLogCategories: setAllCategories,
  };
}
