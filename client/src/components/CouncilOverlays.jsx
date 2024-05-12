import React from "react";
import { Outlet } from "react-router-dom";
import About from "./overlays/About";
import SelectTopic from "./settings/SelectTopic";
import Contact from "./overlays/Contact";
import Share from "./overlays/Share";
import ResetWarning from "./overlays/ResetWarning";
import Completed from "./overlays/Completed";

function CouncilOverlays({ activeOverlay, options, removeOverlay }) {
  const closeUrl = `/icons/close.svg`;

  const closeStyle = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: "50px",
    right: "50px",
    zIndex: "20",
  };

  const closeWrapperStyle = {
    height: "100vh",
    width: "100vw",
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
      case "contact":
      case "share":
        return <Outlet />;
      case "settings":
        return (
          <SelectTopic
            currentTopic={options.topic}
            onReset={options.onReset}
            onCancel={removeOverlay}
          />
        );
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
    <>
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
    <img
      src={closeUrl}
      style={closeStyle}
      onClick={removeOverlay}
    />
    </>
  );
}

export default CouncilOverlays;
