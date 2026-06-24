import type { CSSProperties, ReactElement } from "react";
import { useButtonStore } from "./buttonStore";
import type { ButtonLedMode } from "./ledMode";

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
