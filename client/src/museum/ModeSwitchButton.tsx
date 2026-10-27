import type { CSSProperties, ReactElement } from "react";
import { useLocation } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";

/** Matches active hardware/LED toggle accent — border + glow only, no fill. */
const MODE_SWITCH_BUTTON_BORDER_COLOR = "#fca5a5";
const MODE_SWITCH_BUTTON_BORDER_GLOW =
  "0 0 10px 2px rgba(239, 68, 68, 0.55), 0 0 22px 6px rgba(239, 68, 68, 0.28)";

function modeSwitchButtonAccentBorderStyle(): CSSProperties {
  return {
    borderColor: MODE_SWITCH_BUTTON_BORDER_COLOR,
    boxShadow: MODE_SWITCH_BUTTON_BORDER_GLOW,
  };
}

export function modeSwitchButtonToggleStyle(
  active: boolean,
  base: CSSProperties,
): CSSProperties {
  if (!active) {
    return base;
  }
  return {
    ...base,
    ...modeSwitchButtonAccentBorderStyle(),
  };
}

function modeSwitchButtonPreviewStyle(): CSSProperties {
  return {
    ...modeSwitchButtonAccentBorderStyle(),
    border: `2px solid ${MODE_SWITCH_BUTTON_BORDER_COLOR}`,
    background: "transparent",
    opacity: 1,
  };
}

/**
 * Invisible top-left control for staff to leave installation chrome without
 * reloading.
 *
 * Toggles web ↔ the last installation mode rather than cycling all three: the
 * control exists to drop out to web and come back, and a staff member who has
 * to press it twice to find their way home is worse off than before.
 *
 * On #staff, shows a red border preview of the hit area.
 */
export default function ModeSwitchButton(): ReactElement {
  const { mode, lastInstallationMode, setAppMode } = useCouncilSettings();
  const { hash } = useLocation();
  const showPreview = hash === "#staff";
  const target = mode === "web" ? lastInstallationMode : "web";

  return (
    <button
      type="button"
      data-testid="mode-switch-button"
      aria-label={`Switch to ${target} mode`}
      onClick={() => setAppMode(target)}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "48px",
        height: "48px",
        zIndex: z.modeSwitchButton,
        padding: 0,
        margin: 0,
        cursor: "default",
        ...(showPreview
          ? modeSwitchButtonPreviewStyle()
          : {
              opacity: 0,
              border: "none",
              background: "transparent",
            }),
      }}
    />
  );
}
