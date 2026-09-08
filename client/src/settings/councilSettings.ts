import { useCallback, useEffect, useMemo, useState } from "react";
import { DEV_LOG_CATEGORIES, type LogCategory } from "@/logger";
import { capabilitiesFor, type Capabilities } from "./capabilities";

export { DEV_LOG_CATEGORIES, type LogCategory };
export { capabilitiesFor, type Capabilities };

export const APP_MODE_STORAGE_KEY = "councilAppMode";

export const APP_MODE_CHANGE_EVENT = "council-app-mode-change";

export const APP_MODES = ["web", "museum", "presenter"] as const;

export type AppMode = (typeof APP_MODES)[number];

/**
 * The non-web mode the escape hatch returns to. Museum and presenter are both
 * installations, so the top-left staff target toggles web ↔ whichever of them
 * was last chosen rather than cycling through all three: the control exists to
 * drop out to web and come back, not to browse modes.
 */
export const LAST_INSTALLATION_MODE_STORAGE_KEY = "councilLastInstallationMode";

export const DEV_LOG_ENABLED_KEY = "councilDevLogEnabled";

export const DEV_LOG_DISABLED_CATEGORIES_KEY = "councilDevLogDisabledCategories";

export const DEV_LOG_CHANGE_EVENT = "council-dev-log-change";

export const PTT_HARDWARE_ENABLED_KEY = "councilPttHardwareEnabled";

export const PTT_HARDWARE_CHANGE_EVENT = "council-ptt-hardware-change";

export const MODE_SWITCH_BUTTON_ENABLED_KEY = "councilModeSwitchButtonEnabled";

export const MODE_SWITCH_BUTTON_CHANGE_EVENT = "council-mode-switch-button-change";

function parseAppMode(value: string | null): AppMode {
  return (APP_MODES as readonly string[]).includes(value ?? "") ? (value as AppMode) : "web";
}

export function getAppMode(): AppMode {
  try {
    return parseAppMode(localStorage.getItem(APP_MODE_STORAGE_KEY));
  } catch {
    return "web";
  }
}

/** Installation mode the escape hatch switches into. Museum until staff pick otherwise. */
export function getLastInstallationMode(): Exclude<AppMode, "web"> {
  try {
    const stored = parseAppMode(localStorage.getItem(LAST_INSTALLATION_MODE_STORAGE_KEY));
    return stored === "web" ? "museum" : stored;
  } catch {
    return "museum";
  }
}

/** Capabilities outside React — same source of truth as the hook. */
export function getCapabilities(): Capabilities {
  return capabilitiesFor(getAppMode());
}

export function setAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
    if (mode !== "web") {
      localStorage.setItem(LAST_INSTALLATION_MODE_STORAGE_KEY, mode);
    }
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

/** Top-left staff control to switch mode without opening #staff. */
export function getModeSwitchButtonEnabled(): boolean {
  try {
    return localStorage.getItem(MODE_SWITCH_BUTTON_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setModeSwitchButtonEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(MODE_SWITCH_BUTTON_ENABLED_KEY, "true");
    } else {
      localStorage.removeItem(MODE_SWITCH_BUTTON_ENABLED_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(MODE_SWITCH_BUTTON_CHANGE_EVENT, { detail: enabled }),
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
  /** Non-web mode the escape hatch switches into — see {@link getLastInstallationMode}. */
  lastInstallationMode: Exclude<AppMode, "web">;
  setAppMode: (mode: AppMode) => void;
  capabilities: Capabilities;
  pttHardwareEnabled: boolean;
  setPttHardwareEnabled: (enabled: boolean) => void;
  modeSwitchButtonEnabled: boolean;
  setModeSwitchButtonEnabled: (enabled: boolean) => void;
  devLogEnabled: boolean;
  setDevLogEnabled: (enabled: boolean) => void;
  devLogCategories: Record<LogCategory, boolean>;
  setDevLogCategoryEnabled: (category: LogCategory, enabled: boolean) => void;
  setAllDevLogCategories: (enabled: boolean) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);
  const [lastInstallationMode, setLastInstallationMode] = useState<Exclude<AppMode, "web">>(getLastInstallationMode);
  const [pttHardwareEnabled, setPttHardwareEnabledState] = useState(getPttHardwareEnabled);
  const [modeSwitchButtonEnabled, setModeSwitchButtonEnabledState] =
    useState(getModeSwitchButtonEnabled);
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
      setLastInstallationMode(getLastInstallationMode());
    }

    function onPttHardwareChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setPttHardwareEnabledState(next);
    }

    function onModeSwitchButtonChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setModeSwitchButtonEnabledState(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === APP_MODE_STORAGE_KEY) {
        setMode(getAppMode());
      }
      if (event.key === LAST_INSTALLATION_MODE_STORAGE_KEY) {
        setLastInstallationMode(getLastInstallationMode());
      }
      if (event.key === PTT_HARDWARE_ENABLED_KEY) {
        setPttHardwareEnabledState(getPttHardwareEnabled());
      }
      if (event.key === MODE_SWITCH_BUTTON_ENABLED_KEY) {
        setModeSwitchButtonEnabledState(getModeSwitchButtonEnabled());
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
    window.addEventListener(MODE_SWITCH_BUTTON_CHANGE_EVENT, onModeSwitchButtonChange);
    window.addEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener(PTT_HARDWARE_CHANGE_EVENT, onPttHardwareChange);
      window.removeEventListener(MODE_SWITCH_BUTTON_CHANGE_EVENT, onModeSwitchButtonChange);
      window.removeEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshDevLogSettings]);

  const setAppModeFromHook = useCallback((next: AppMode) => {
    setAppMode(next);
    setMode(next);
    setLastInstallationMode(getLastInstallationMode());
  }, []);

  const setPttHardwareEnabledFromHook = useCallback((enabled: boolean) => {
    setPttHardwareEnabled(enabled);
    setPttHardwareEnabledState(enabled);
  }, []);

  const setModeSwitchButtonEnabledFromHook = useCallback((enabled: boolean) => {
    setModeSwitchButtonEnabled(enabled);
    setModeSwitchButtonEnabledState(enabled);
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
    lastInstallationMode,
    setAppMode: setAppModeFromHook,
    capabilities,
    pttHardwareEnabled,
    setPttHardwareEnabled: setPttHardwareEnabledFromHook,
    modeSwitchButtonEnabled,
    setModeSwitchButtonEnabled: setModeSwitchButtonEnabledFromHook,
    devLogEnabled,
    setDevLogEnabled: setDevLogEnabledFromHook,
    devLogCategories,
    setDevLogCategoryEnabled: setDevLogCategory,
    setAllDevLogCategories: setAllCategories,
  };
}
