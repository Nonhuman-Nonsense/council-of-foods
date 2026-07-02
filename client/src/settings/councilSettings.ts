import { useCallback, useEffect, useState } from "react";
import { DEV_LOG_CATEGORIES, type LogCategory } from "@/logger";

export { DEV_LOG_CATEGORIES, type LogCategory };

export const APP_MODE_STORAGE_KEY = "councilAppMode";

export const APP_MODE_CHANGE_EVENT = "council-app-mode-change";

export type AppMode = "web" | "museum";

export const AGENT_MODE_STORAGE_KEY = "councilAgentMode";

export const AGENT_MODE_CHANGE_EVENT = "council-agent-mode-change";

export type AgentMode = "off" | "always-on" | "ptt";

const AGENT_MODES: readonly AgentMode[] = ["off", "always-on", "ptt"];

export const DEV_LOG_ENABLED_KEY = "councilDevLogEnabled";

export const DEV_LOG_DISABLED_CATEGORIES_KEY = "councilDevLogDisabledCategories";

export const DEV_LOG_CHANGE_EVENT = "council-dev-log-change";

export const PTT_HARDWARE_ENABLED_KEY = "councilPttHardwareEnabled";

export const PTT_HARDWARE_CHANGE_EVENT = "council-ptt-hardware-change";

export const ESCAPE_HATCH_ENABLED_KEY = "councilEscapeHatchEnabled";

export const ESCAPE_HATCH_CHANGE_EVENT = "council-escape-hatch-change";

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

  if (mode === "museum" && getAgentMode() === "off") {
    setAgentMode("always-on");
  }

  window.dispatchEvent(new CustomEvent<AppMode>(APP_MODE_CHANGE_EVENT, { detail: mode }));
}

export function getAgentMode(): AgentMode {
  try {
    const stored = localStorage.getItem(AGENT_MODE_STORAGE_KEY);
    if (stored && AGENT_MODES.includes(stored as AgentMode)) {
      return stored as AgentMode;
    }
  } catch {
    // ignore storage errors
  }
  return "off";
}

export function setAgentMode(mode: AgentMode): void {
  try {
    localStorage.setItem(AGENT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  if (mode !== "ptt") {
    setPttHardwareEnabled(false);
  }

  window.dispatchEvent(new CustomEvent<AgentMode>(AGENT_MODE_CHANGE_EVENT, { detail: mode }));
}

/** USB hardware button via local bridge. Only applies when agent mode is push-to-talk. */
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

/** Top-left staff control to toggle web/museum without opening #setup. */
export function getEscapeHatchEnabled(): boolean {
  try {
    return localStorage.getItem(ESCAPE_HATCH_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setEscapeHatchEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(ESCAPE_HATCH_ENABLED_KEY, "true");
    } else {
      localStorage.removeItem(ESCAPE_HATCH_ENABLED_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(new CustomEvent<boolean>(ESCAPE_HATCH_CHANGE_EVENT, { detail: enabled }));
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
  agentMode: AgentMode;
  setAgentMode: (mode: AgentMode) => void;
  pttHardwareEnabled: boolean;
  setPttHardwareEnabled: (enabled: boolean) => void;
  escapeHatchEnabled: boolean;
  setEscapeHatchEnabled: (enabled: boolean) => void;
  devLogEnabled: boolean;
  setDevLogEnabled: (enabled: boolean) => void;
  devLogCategories: Record<LogCategory, boolean>;
  setDevLogCategoryEnabled: (category: LogCategory, enabled: boolean) => void;
  setAllDevLogCategories: (enabled: boolean) => void;
} {
  const [mode, setMode] = useState<AppMode>(getAppMode);
  const [agentMode, setAgentModeState] = useState(getAgentMode);
  const [pttHardwareEnabled, setPttHardwareEnabledState] = useState(getPttHardwareEnabled);
  const [escapeHatchEnabled, setEscapeHatchEnabledState] = useState(getEscapeHatchEnabled);
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

    function onAgentModeChange(event: Event): void {
      const next = (event as CustomEvent<AgentMode>).detail;
      setAgentModeState(next);
      if (next !== "ptt") {
        setPttHardwareEnabledState(false);
      }
    }

    function onPttHardwareChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setPttHardwareEnabledState(next);
    }

    function onEscapeHatchChange(event: Event): void {
      const next = (event as CustomEvent<boolean>).detail;
      setEscapeHatchEnabledState(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key === APP_MODE_STORAGE_KEY) {
        setMode(getAppMode());
      }
      if (event.key === AGENT_MODE_STORAGE_KEY) {
        setAgentModeState(getAgentMode());
        if (getAgentMode() !== "ptt") {
          setPttHardwareEnabledState(false);
        }
      }
      if (event.key === PTT_HARDWARE_ENABLED_KEY) {
        setPttHardwareEnabledState(getPttHardwareEnabled());
      }
      if (event.key === ESCAPE_HATCH_ENABLED_KEY) {
        setEscapeHatchEnabledState(getEscapeHatchEnabled());
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
    window.addEventListener(AGENT_MODE_CHANGE_EVENT, onAgentModeChange);
    window.addEventListener(PTT_HARDWARE_CHANGE_EVENT, onPttHardwareChange);
    window.addEventListener(ESCAPE_HATCH_CHANGE_EVENT, onEscapeHatchChange);
    window.addEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      window.removeEventListener(AGENT_MODE_CHANGE_EVENT, onAgentModeChange);
      window.removeEventListener(PTT_HARDWARE_CHANGE_EVENT, onPttHardwareChange);
      window.removeEventListener(ESCAPE_HATCH_CHANGE_EVENT, onEscapeHatchChange);
      window.removeEventListener(DEV_LOG_CHANGE_EVENT, onDevLogChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshDevLogSettings]);

  const setAppModeFromHook = useCallback((next: AppMode) => {
    setAppMode(next);
    setMode(next);
    if (next === "museum" && getAgentMode() === "off") {
      setAgentMode("always-on");
      setAgentModeState("always-on");
    }
  }, []);

  const setAgentModeFromHook = useCallback((next: AgentMode) => {
    setAgentMode(next);
    setAgentModeState(next);
    if (next !== "ptt") {
      setPttHardwareEnabledState(false);
    }
  }, []);

  const setPttHardwareEnabledFromHook = useCallback((enabled: boolean) => {
    setPttHardwareEnabled(enabled);
    setPttHardwareEnabledState(enabled);
  }, []);

  const setEscapeHatchEnabledFromHook = useCallback((enabled: boolean) => {
    setEscapeHatchEnabled(enabled);
    setEscapeHatchEnabledState(enabled);
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
    agentMode,
    setAgentMode: setAgentModeFromHook,
    pttHardwareEnabled,
    setPttHardwareEnabled: setPttHardwareEnabledFromHook,
    escapeHatchEnabled,
    setEscapeHatchEnabled: setEscapeHatchEnabledFromHook,
    devLogEnabled,
    setDevLogEnabled: setDevLogEnabledFromHook,
    devLogCategories,
    setDevLogCategoryEnabled: setDevLogCategory,
    setAllDevLogCategories: setAllCategories,
  };
}
