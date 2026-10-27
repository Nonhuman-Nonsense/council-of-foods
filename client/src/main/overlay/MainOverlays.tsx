import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { isMeetingPath, isRootPath } from "@/navigation";

import OverlayWrapper from './OverlayWrapper';
import Overlay from "./Overlay";
import About from "./About";
import Contact from "./Contact";
import ResetWarning from "./ResetWarning";
import SelectTopic from "@newMeeting/SelectTopic";
import type { Topic } from "@shared/ModelTypes";
import { useTranslation } from "react-i18next";

const Staff = lazy(() => import("./Staff"));

/** Overlays Escape closes, as their ✕ would. Not #settings: Escape would drop a half-made topic choice. */
const ESCAPE_CLOSES = ["#about", "#contact", "#staff", "#reset", "#warning"];

interface MainOverlaysProps {
  topic: Topic | null;
  onReset: (resetTopic?: Topic) => void;
  onCloseOverlay: () => void;
}

/**
 * MainOverlays Component
 * 
 * Manages the top-level application overlays that are triggered via URL hash.
 * Examples: #about, #contact, #staff, #settings, #reset.
 * 
 * Core Logic:
 * - **Hash Routing**: Listens to `location.hash` to determine which overlay to show.
 * - **Auto-Close**: Logic to automatically close invalid overlays based on current route (e.g., closing #reset if not meaningful).
 * - **Composition**: Wraps content in `Overlay` > `OverlayWrapper` for consistent layout.
 * - **Keyboard**: Escape closes the overlays in `ESCAPE_CLOSES`; Cmd/Ctrl+S opens #staff in every
 *   mode, so a keyboard reaches it without a mouse.
 */
function MainOverlays({ topic, onReset, onCloseOverlay }: MainOverlaysProps): React.ReactElement {

  const navigate = useNavigate();
  const location = useLocation();

  const { t } = useTranslation();

  // Reset the hash in certain conditions
  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      if (!["#about", "#contact", "#staff", "#reset", "#settings", '#warning'].includes(hash)) {
        cancelOverlay();
      } else if (!isMeetingPath(location.pathname) && ["#settings"].includes(hash)) {
        cancelOverlay();
      } else if (isRootPath(location.pathname) && ["#reset", '#warning'].includes(hash)) {
        cancelOverlay();
      }
    }
  }, [location]);

  function cancelOverlay(): void {
    navigate({ hash: "" });
    onCloseOverlay();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && ESCAPE_CLOSES.includes(location.hash)) {
        event.preventDefault();
        cancelOverlay();
        return;
      }
      // By physical key, so it is the same S on every keyboard layout.
      const isSave = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === "KeyS";
      if (isSave) {
        // Swallowed even when staff is already open, so Chrome's save dialog never appears.
        event.preventDefault();
        if (!event.repeat && location.hash !== "#staff") navigate({ hash: "#staff" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const showOverlay = (location.hash !== "");

  const renderOverlayContent = (): React.ReactElement | null => {
    switch (location.hash) {
      case "#about":
        return <About />;
      case "#contact":
        return <Contact />;
      case "#staff":
        return (
          <Suspense fallback={null}>
            <Staff />
          </Suspense>
        );
      case "#settings":
        return (
          <SelectTopic
            currentTopic={topic ?? undefined}
            onReset={onReset}
            onCancel={cancelOverlay}
            onContinueForward={() => { }}
          />
        );
      case "#reset":
        return <ResetWarning
          onReset={() => onReset()}
          onCancel={cancelOverlay}
        />;
      case "#warning":
        return <ResetWarning
          message={t('reset.lang')}
          onReset={() => onReset()}
          onCancel={cancelOverlay}
        />;
      default:
        return null; // No overlay content if no section is active
    }
  };

  const isStaff = location.hash === "#staff";

  return (
    <Overlay isActive={showOverlay} layer={isStaff ? "staff" : "route"}>
      {showOverlay &&
        <OverlayWrapper showX={true} cancelOverlay={cancelOverlay}>
          {renderOverlayContent()}
        </OverlayWrapper>
      }
    </Overlay>
  );
}



export default MainOverlays;