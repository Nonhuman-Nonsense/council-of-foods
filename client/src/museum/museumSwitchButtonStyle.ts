import type { CSSProperties } from "react";

/** Matches active hardware/LED toggle accent — border + glow only, no fill. */
export const MUSEUM_SWITCH_BUTTON_BORDER_COLOR = "#fca5a5";
export const MUSEUM_SWITCH_BUTTON_BORDER_GLOW =
  "0 0 10px 2px rgba(239, 68, 68, 0.55), 0 0 22px 6px rgba(239, 68, 68, 0.28)";

export function museumSwitchButtonAccentBorderStyle(): CSSProperties {
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

export function museumSwitchButtonPreviewStyle(): CSSProperties {
  return {
    ...museumSwitchButtonAccentBorderStyle(),
    border: `2px solid ${MUSEUM_SWITCH_BUTTON_BORDER_COLOR}`,
    background: "transparent",
    opacity: 1,
  };
}
