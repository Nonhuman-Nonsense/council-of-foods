import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

import OverlayWrapper from './OverlayWrapper.jsx';
import Overlay from "./Overlay";
import About from "./overlays/About.jsx";
import Contact from "./overlays/Contact.jsx";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic from "./settings/SelectTopic";
import { useTranslation } from "react-i18next";

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
      } else if (!location.pathname.substring(4).startsWith('meeting') && ["#settings"].includes(hash)) {
        removeOverlay();
      } else if (location.pathname.substring(4) === '' && ["#reset",'#warning'].includes(hash)) {
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