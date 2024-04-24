import React from "react";
import About from "./About";
import Topics from "./Topics";
import Contact from "./Contact";
import Share from "./Share";
import ResetWarning from "./ResetWarning";

function CouncilOverlays({ activeOverlay, options, removeOverlay }) {

  const closeWrapperStyle = {
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
          <Topics
            currentTopic={options.topic}
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
      default:
        return null; // No overlay content if no section is active
      };
    };

  return (
    <div style={closeWrapperStyle}>
      <div style={closeInnerStyle}>
        <div style={clickerStyle} onClick={removeOverlay} />
        <div style={middleColumn}>
          <div style={clickerStyle} onClick={removeOverlay}/>
          {renderOverlayContent()}
          <div style={clickerStyle} onClick={removeOverlay}/>
        </div>
        <div style={clickerStyle} onClick={removeOverlay}/>
      </div>
    </div>
  );
}

export default CouncilOverlays;
