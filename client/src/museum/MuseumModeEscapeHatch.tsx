import type { ReactElement } from "react";
import { useLocation } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";
import { escapeHatchPreviewStyle } from "@/museum/escapeHatchStyle";
import { z } from "@/zIndexLayers";

/**
 * Invisible top-left control for staff to toggle web/museum without reloading.
 * On #setup, shows a red border preview of the hit area.
 */
export default function MuseumModeEscapeHatch(): ReactElement {
  const { isMuseumMode, setAppMode } = useCouncilSettings();
  const { hash } = useLocation();
  const showPreview = hash === "#setup";

  return (
    <button
      type="button"
      data-testid="museum-mode-escape"
      aria-label={isMuseumMode ? "Switch to web mode" : "Switch to museum mode"}
      onClick={() => setAppMode(isMuseumMode ? "web" : "museum")}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "48px",
        height: "48px",
        zIndex: z.museumEscape,
        padding: 0,
        margin: 0,
        cursor: "default",
        ...(showPreview
          ? escapeHatchPreviewStyle()
          : {
              opacity: 0,
              border: "none",
              background: "transparent",
            }),
      }}
    />
  );
}
