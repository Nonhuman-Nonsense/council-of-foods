import React from "react";
import About from "./overlays/About";
import SelectTopic from "./settings/SelectTopic";
import Contact from "./overlays/Contact";
import Share from "./overlays/Share";
import ResetWarning from "./overlays/ResetWarning";
import Completed from "./overlays/Completed";

function CouncilOverlays({ activeOverlay, options, removeOverlay }) {
  const closeWrapperStyle = {
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "5",
  };

  const closeInnerStyle = {
    height: "calc(100% - 110px)",
    width: "100%",
    display: "flex",
    marginTop: "110px",
  };

  const clickerStyle = {
    flex: 1,
  };

  const middleColumn = {
    display: "flex",
    flexDirection: "column",
  };

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
    switch (activeOverlay) {
      case "about":
        return <About />;
      case "settings":
        return (
          <SelectTopic
            currentTopic={options.topic.name}
            onReset={options.onReset}
            onCancel={removeOverlay}
          />
        );
      case "contact":
        return <Contact />;
      case "share":
        return <Share />;
      case "reset":
        return (
          <ResetWarning
            onReset={() => options.onReset()}
            onCancel={removeOverlay}
          />
        );
      case "completed":
        return (
          <Completed
            onContinue={options.onContinue}
            onWrapItUp={options.onWrapItUp}
          />
        );
      default:
        return null; // No overlay content if no section is active
    }
  };

  return (
    <div style={closeWrapperStyle}>
      <div style={closeInnerStyle}>
        <div
          style={clickerStyle}
          onClick={removeOverlay}
        />
        <div style={middleColumn}>
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
          {renderOverlayContent()}
          <div
            style={clickerStyle}
            onClick={removeOverlay}
          />
        </div>
        <div
          style={clickerStyle}
          onClick={removeOverlay}
        />
      </div>
    </div>
  );
}

export default CouncilOverlays;
