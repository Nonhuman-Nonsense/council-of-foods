import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

import OverlayWrapper from './OverlayWrapper.jsx';
import Overlay from "./Overlay";
import About from "./overlays/About.jsx";
import Contact from "./overlays/Contact.jsx";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic from "./settings/SelectTopic";
import { useTranslation } from "react-i18next";

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
 * 
 * @param {Object} props
 * @param {Array} props.topics - List of available topics.
 * @param {Object} props.topic - Current active topic.
 * @param {Function} props.onReset - Global reset handler.
 * @param {Function} props.onCloseOverlay - Callback when overlay is closed.
 */
function MainOverlays({ topics, topic, onReset, onCloseOverlay }) {

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

  function removeOverlay() {
    navigate({ hash: "" });
    onCloseOverlay();
  }

  const showOverlay = (location.hash !== "");

  const renderOverlayContent = () => {
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