import type { CSSProperties } from "react";

/** Matches active hardware/LED toggle accent — border + glow only, no fill. */
export const ESCAPE_HATCH_BORDER_COLOR = "#fca5a5";
export const ESCAPE_HATCH_BORDER_GLOW =
  "0 0 10px 2px rgba(239, 68, 68, 0.55), 0 0 22px 6px rgba(239, 68, 68, 0.28)";

export function escapeHatchAccentBorderStyle(): CSSProperties {
  return {
    borderColor: ESCAPE_HATCH_BORDER_COLOR,
    boxShadow: ESCAPE_HATCH_BORDER_GLOW,
  };
}

export function escapeHatchToggleStyle(
  active: boolean,
  base: CSSProperties,
): CSSProperties {
  if (!active) {
    return base;
  }
  return {
    ...base,
    ...escapeHatchAccentBorderStyle(),
  };
}

export function escapeHatchPreviewStyle(): CSSProperties {
  return {
    ...escapeHatchAccentBorderStyle(),
    border: `2px solid ${ESCAPE_HATCH_BORDER_COLOR}`,
    background: "transparent",
    opacity: 1,
  };
}
