import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { useButtonStore } from "./buttonStore";
import type { ButtonLedMode } from "./buttonStore";

export const BUTTON_LED_DEBUG_STORAGE_KEY = "councilButtonLedDebug";

export const BUTTON_LED_DEBUG_CHANGE_EVENT = "council-button-led-debug-change";

export function getButtonLedDebugOverlay(): boolean {
  try {
    return localStorage.getItem(BUTTON_LED_DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setButtonLedDebugOverlay(enabled: boolean): void {
  try {
    localStorage.setItem(BUTTON_LED_DEBUG_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(BUTTON_LED_DEBUG_CHANGE_EVENT, { detail: enabled }),
  );
}

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
    setButtonLedDebugOverlay(enabled);
    setLedDebugOverlayState(enabled);
  }, []);

  return { ledDebugOverlay, setLedDebugOverlay };
}

const indicatorBaseStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "2px solid rgba(255, 255, 255, 0.55)",
  boxSizing: "border-box",
};

const modeStyles: Record<ButtonLedMode, CSSProperties> = {
  off: {
    backgroundColor: "#2a2a2a",
    boxShadow: "none",
  },
  on: {
    backgroundColor: "#ef4444",
    boxShadow: "0 0 14px rgba(239, 68, 68, 0.95)",
  },
  pulse: {
    backgroundColor: "#ef4444",
    animation: "button-led-debug-pulse 1.2s ease-in-out infinite",
  },
};

/**
 * On-screen LED indicator for development without physical hardware.
 * Enabled via localStorage (`councilButtonLedDebug`) or Setup toggle.
 */
export default function ButtonLedDebugOverlay(): ReactElement {
  const ledMode = useButtonStore((state) => state.ledMode);
  const buttonOwner = useButtonStore((state) => state.buttonOwner);

  const label = buttonOwner ? `LED ${ledMode} (${buttonOwner})` : `LED ${ledMode}`;

  return (
    <div
      data-testid="button-led-debug-overlay"
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 10002,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
      aria-hidden
    >
      <div
        data-testid="button-led-debug-indicator"
        data-led-mode={ledMode}
        title={label}
        style={{ ...indicatorBaseStyle, ...modeStyles[ledMode] }}
      />
      <span
        style={{
          fontSize: 10,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.75)",
          textShadow: "0 1px 2px rgba(0,0,0,0.8)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
