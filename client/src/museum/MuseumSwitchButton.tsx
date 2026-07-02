import type { CSSProperties, ReactElement } from "react";
import { useLocation } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";

/** Matches active hardware/LED toggle accent — border + glow only, no fill. */
const MUSEUM_SWITCH_BUTTON_BORDER_COLOR = "#fca5a5";
const MUSEUM_SWITCH_BUTTON_BORDER_GLOW =
  "0 0 10px 2px rgba(239, 68, 68, 0.55), 0 0 22px 6px rgba(239, 68, 68, 0.28)";

function museumSwitchButtonAccentBorderStyle(): CSSProperties {
  return {
    borderColor: MUSEUM_SWITCH_BUTTON_BORDER_COLOR,
    boxShadow: MUSEUM_SWITCH_BUTTON_BORDER_GLOW,
  };
}

export function museumSwitchButtonToggleStyle(
  active: boolean,
  base: CSSProperties,
): CSSProperties {
  if (!active) {
    return base;
  }
  return {
    ...base,
    ...museumSwitchButtonAccentBorderStyle(),
  };
}

function museumSwitchButtonPreviewStyle(): CSSProperties {
  return {
    ...museumSwitchButtonAccentBorderStyle(),
    border: `2px solid ${MUSEUM_SWITCH_BUTTON_BORDER_COLOR}`,
    background: "transparent",
    opacity: 1,
  };
}

/**
 * Invisible top-left control for staff to toggle web/museum without reloading.
 * On #setup, shows a red border preview of the hit area.
 */
export default function MuseumSwitchButton(): ReactElement {
  const { isMuseumMode, setAppMode } = useCouncilSettings();
  const { hash } = useLocation();
  const showPreview = hash === "#setup";

  return (
    <button
      type="button"
      data-testid="museum-switch-button"
      aria-label={isMuseumMode ? "Switch to web mode" : "Switch to museum mode"}
      onClick={() => setAppMode(isMuseumMode ? "web" : "museum")}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "48px",
        height: "48px",
        zIndex: z.museumSwitchButton,
        padding: 0,
        margin: 0,
        cursor: "default",
        ...(showPreview
          ? museumSwitchButtonPreviewStyle()
          : {
              opacity: 0,
              border: "none",
              background: "transparent",
            }),
      }}
    />
  );
}
