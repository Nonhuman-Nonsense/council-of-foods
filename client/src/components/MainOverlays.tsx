import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

import OverlayWrapper from './OverlayWrapper';
import Overlay from "./Overlay";
import About from "./overlays/About";
import Contact from "./overlays/Contact";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic, { Topic } from "./settings/SelectTopic";
import { useTranslation } from "react-i18next";

interface MainOverlaysProps {
  topics: Topic[];
  topic: Topic;
  onReset: () => void;
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
function MainOverlays({ topics, topic, onReset, onCloseOverlay }: MainOverlaysProps): React.ReactElement {

  const navigate = useNavigate();
  const location = useLocation();

  const { t } = useTranslation();

  // Reset the hash in certain conditions
  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      if (!["#about", "#contact", "#reset", "#settings", '#warning'].includes(hash)) {
        removeOverlay();
      } else if (!location.pathname.substring(1).startsWith('meeting') && ["#settings"].includes(hash)) {
        removeOverlay();
      } else if (location.pathname.substring(1) === '' && ["#reset", '#warning'].includes(hash)) {
        removeOverlay();
      }
    }
  }, [location]);

  function removeOverlay(): void {
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
            topics={topics}
            currentTopic={topic}
            onReset={onReset}
            onCancel={removeOverlay}
            onContinueForward={() => { }}
          />
        );
      case "#reset":
        return <ResetWarning
          onReset={() => onReset()}
          onCancel={removeOverlay}
        />;
      case "#warning":
        return <ResetWarning
          message={t('reset.lang')}
          onReset={() => onReset()}
          onCancel={removeOverlay}
        />;
      default:
        return null; // No overlay content if no section is active
    }
  };

  return (
    <Overlay isActive={showOverlay}>
      {showOverlay &&
        <OverlayWrapper showX={true} removeOverlay={removeOverlay}>
          {renderOverlayContent()}
        </OverlayWrapper>
      }
    </Overlay>
  );
}

export default MainOverlays;