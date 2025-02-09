import React, { useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";

import OverlayWrapper from './OverlayWrapper.jsx';
import Overlay from "./Overlay";
import About from "./overlays/About.jsx";
import Contact from "./overlays/Contact.jsx";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic from "./settings/SelectTopic";

function MainOverlays({ topic, onReset }) {

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // TODO fix so that settings is removed if location is not meeting
  // And reset is removed if it is landing
  useEffect(() => {
    if (!["about", "contact", "reset", "settings"].includes(searchParams.get('o'))) {
      removeOverlay();
    }adsadas
  }, [location, searchParams]);

  function removeOverlay() {
    navigate({ search: "" });
  }

  const showOverlay = (searchParams.get('o') !== null);

  const renderOverlayContent = () => {
    switch (searchParams.get('o')) {
      case "about":
        return <About />;
      case "contact":
        return <Contact />;
      case "settings":
        return (
          <SelectTopic
            currentTopic={topic}
            onReset={onReset}
            onCancel={removeOverlay}
          />
        );
      case "reset":
        return <ResetWarning
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