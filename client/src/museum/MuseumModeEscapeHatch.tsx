import type { ReactElement } from "react";
import { useCouncilSettings } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";

/**
 * Invisible top-left control for staff to exit museum mode without reloading.
 * Restores web chrome (navbar, fullscreen, voice guide toggle) in place.
 */
export default function MuseumModeEscapeHatch(): ReactElement {
  const { setAppMode } = useCouncilSettings();

  return (
    <button
      type="button"
      data-testid="museum-mode-escape"
      aria-label="Exit museum mode"
      onClick={() => setAppMode("web")}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "48px",
        height: "48px",
        opacity: 0,
        zIndex: z.museumEscape,
        border: "none",
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "default",
      }}
    />
  );
}
