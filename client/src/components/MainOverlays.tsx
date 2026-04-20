import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { isMeetingPath, isRootPath } from "@/routing";

import OverlayWrapper from './OverlayWrapper';
import Overlay from "./Overlay";
import About from "./overlays/About";
import Contact from "./overlays/Contact";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic  from "./settings/SelectTopic";
import type { Topic } from "@shared/ModelTypes";
import { useTranslation } from "react-i18next";

interface MainOverlaysProps {
  topic: Topic | null;
  onReset: (resetTopic?: Topic) => void;
  onCloseOverlay: () => void;
}

/**
 * MainOverlays Component
 * 
 * Manages the top-level application overlays that are triggered via URL hash.
 * Examples: #about, #contact, #settings, #reset.
 * 
 * Core Logic:
 * - **Hash Routing**: Listens to `location.hash` to determine which overlay to show.
 * - **Auto-Close**: Logic to automatically close invalid overlays based on current route (e.g., closing #reset if not meaningful).
 * - **Composition**: Wraps content in `Overlay` > `OverlayWrapper` for consistent layout.
 */
function MainOverlays({ topic, onReset, onCloseOverlay }: MainOverlaysProps): React.ReactElement {

  const navigate = useNavigate();
  const location = useLocation();

  const { t } = useTranslation();

  // Reset the hash in certain conditions
  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      if (!["#about", "#contact", "#reset", "#settings", '#warning'].includes(hash)) {
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

  const showOverlay = (location.hash !== "");

  const renderOverlayContent = (): React.ReactElement | null => {
    switch (location.hash) {
      case "#about":
        return <About />;
      case "#contact":
        return <Contact />;
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

  return (
    <Overlay isActive={showOverlay}>
      {showOverlay &&
        <OverlayWrapper showX={true} cancelOverlay={cancelOverlay}>
          {renderOverlayContent()}
        </OverlayWrapper>
      }
    </Overlay>
  );
}

export default MainOverlays;