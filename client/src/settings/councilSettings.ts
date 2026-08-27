import { useCallback, useEffect, useMemo, useState } from "react";
import { DEV_LOG_CATEGORIES, type LogCategory } from "@/logger";
import { capabilitiesFor, type Capabilities } from "./capabilities";

export { DEV_LOG_CATEGORIES, type LogCategory };
export { capabilitiesFor, type Capabilities };

export const APP_MODE_STORAGE_KEY = "councilAppMode";

export const APP_MODE_CHANGE_EVENT = "council-app-mode-change";

export type AppMode = "web" | "museum";

/**
 * Retired: the agent's listening behaviour is derived from the mode now. Read
 * once on load only to clear it, so an install that stored "off" or "always-on"
 * cannot keep influencing anything.
 */
const LEGACY_AGENT_MODE_STORAGE_KEY = "councilAgentMode";

export const DEV_LOG_ENABLED_KEY = "councilDevLogEnabled";

export const DEV_LOG_DISABLED_CATEGORIES_KEY = "councilDevLogDisabledCategories";

export const DEV_LOG_CHANGE_EVENT = "council-dev-log-change";

export const PTT_HARDWARE_ENABLED_KEY = "councilPttHardwareEnabled";

export const PTT_HARDWARE_CHANGE_EVENT = "council-ptt-hardware-change";

export const MUSEUM_SWITCH_BUTTON_ENABLED_KEY = "councilMuseumSwitchButtonEnabled";

export const MUSEUM_SWITCH_BUTTON_CHANGE_EVENT = "council-museum-switch-button-change";

const LEGACY_ESCAPE_HATCH_ENABLED_KEY = "councilEscapeHatchEnabled";

/** Drop retired keys so they cannot be mistaken for live settings later. */
export function clearRetiredSettings(): void {
  try {
    localStorage.removeItem(LEGACY_AGENT_MODE_STORAGE_KEY);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function getAppMode(): AppMode {
  try {
    return localStorage.getItem(APP_MODE_STORAGE_KEY) === "museum" ? "museum" : "web";
  } catch {
    return "web";
  }
}

/** Capabilities outside React — same source of truth as the hook. */
export function getCapabilities(): Capabilities {
  return capabilitiesFor(getAppMode());
}

export function setAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(new CustomEvent<AppMode>(APP_MODE_CHANGE_EVENT, { detail: mode }));
}

/**
 * USB hardware button via local bridge. Independent of the mode: a laptop in web
 * mode can drive a real button to test one.
 */
export function getPttHardwareEnabled(): boolean {
  try {
    return localStorage.getItem(PTT_HARDWARE_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPttHardwareEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(PTT_HARDWARE_ENABLED_KEY, "true");
    } else {
      localStorage.removeItem(PTT_HARDWARE_ENABLED_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(new CustomEvent<boolean>(PTT_HARDWARE_CHANGE_EVENT, { detail: enabled }));
}

/** Top-left staff control to toggle web/museum without opening #staff. */
export function getMuseumSwitchButtonEnabled(): boolean {
  try {
    const stored = localStorage.getItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY);
    if (stored === "true") {
      return true;
    }

    const legacy = localStorage.getItem(LEGACY_ESCAPE_HATCH_ENABLED_KEY);
    if (legacy === "true") {
      localStorage.setItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY, "true");
      localStorage.removeItem(LEGACY_ESCAPE_HATCH_ENABLED_KEY);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function setMuseumSwitchButtonEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY, "true");
    } else {
      localStorage.removeItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY);
      localStorage.removeItem(LEGACY_ESCAPE_HATCH_ENABLED_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(MUSEUM_SWITCH_BUTTON_CHANGE_EVENT, { detail: enabled }),
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
  capabilities: Capabilities;
  pttHardwareEnabled: boolean;
  setPttHardwareEnabled: (enabled: boolean) => void;
  museumSwitchButtonEnabled: boolean;
  setMuseumSwitchButtonEnabled: (enabled: boolean) => void;
  devLogEnabled: boolean;
  setDevLogEnabled: (enabled: boolean) => void;
  devLogCategories: Record<LogCategory, boolean>;
  setDevLogCategoryEnabled: (category: LogCategory, enabled: boolean) => void;
  setAllDevLogCategories: (enabled: boolean) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);
  const [pttHardwareEnabled, setPttHardwareEnabledState] = useState(getPttHardwareEnabled);
  const [museumSwitchButtonEnabled, setMuseumSwitchButtonEnabledState] =
    useState(getMuseumSwitchButtonEnabled);
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

    function onPttHardwareChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setPttHardwareEnabledState(next);
    }

    function onMuseumSwitchButtonChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setMuseumSwitchButtonEnabledState(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === APP_MODE_STORAGE_KEY) {
        setMode(getAppMode());
      }
      if (event.key === PTT_HARDWARE_ENABLED_KEY) {
        setPttHardwareEnabledState(getPttHardwareEnabled());
      }
      if (event.key === MUSEUM_SWITCH_BUTTON_ENABLED_KEY) {
        setMuseumSwitchButtonEnabledState(getMuseumSwitchButtonEnabled());
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
    window.addEventListener(PTT_HARDWARE_CHANGE_EVENT, onPttHardwareChange);
    window.addEventListener(MUSEUM_SWITCH_BUTTON_CHANGE_EVENT, onMuseumSwitchButtonChange);
    window.addEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener(PTT_HARDWARE_CHANGE_EVENT, onPttHardwareChange);
      window.removeEventListener(MUSEUM_SWITCH_BUTTON_CHANGE_EVENT, onMuseumSwitchButtonChange);
      window.removeEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshDevLogSettings]);

  const setAppModeFromHook = useCallback((next: AppMode) => {
    setAppMode(next);
    setMode(next);
  }, []);

  const setPttHardwareEnabledFromHook = useCallback((enabled: boolean) => {
    setPttHardwareEnabled(enabled);
    setPttHardwareEnabledState(enabled);
  }, []);

  const setMuseumSwitchButtonEnabledFromHook = useCallback((enabled: boolean) => {
    setMuseumSwitchButtonEnabled(enabled);
    setMuseumSwitchButtonEnabledState(enabled);
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

  const capabilities = useMemo(() => capabilitiesFor(mode), [mode]);

  return {
    mode,
    isMuseumMode: mode === "museum",
    setAppMode: setAppModeFromHook,
    capabilities,
    pttHardwareEnabled,
    setPttHardwareEnabled: setPttHardwareEnabledFromHook,
    museumSwitchButtonEnabled,
    setMuseumSwitchButtonEnabled: setMuseumSwitchButtonEnabledFromHook,
    devLogEnabled,
    setDevLogEnabled: setDevLogEnabledFromHook,
    devLogCategories,
    setDevLogCategoryEnabled: setDevLogCategory,
    setAllDevLogCategories: setAllCategories,
  };
}
