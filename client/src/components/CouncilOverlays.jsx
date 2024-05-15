import React from "react";
import { Outlet } from "react-router-dom";
import SelectTopic from "./settings/SelectTopic";
import ResetWarning from "./overlays/ResetWarning";
import Completed from "./overlays/Completed";
import Summary from "./overlays/Summary";
import { useMobile } from "../utils";

function CouncilOverlays({
  activeOverlay,
  options,
  removeOverlay,
  summary,
  meetingId,
}) {
  const isMobile = useMobile();
  const closeUrl = `/icons/close.svg`;

  const closeStyle = {
    position: "absolute",
    cursor: "pointer",
    width: "35px",
    height: "35px",
    top: isMobile ? "60px" : "100px",
    right: isMobile ? "15px" : "100px",
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
    height: isMobile ? "calc(100% - 55px)" : "calc(100% - 60px)",
    width: "100%",
    display: "flex",
    marginTop: isMobile ? "55px" : "60px",
  };

  const clickerStyle = {
    flex: 1,
  };

  const middleColumn = {
    display: "flex",
    flexDirection: "column",
    overflow: isMobile && "auto",
  };

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
    switch (activeOverlay) {
      case "about":
      case "contact":
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
            continuations={options.continuations}
          />
        );
      case "summary":
        return (
          <Summary
            summary={summary}
            meetingId={meetingId}
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
      {activeOverlay !== "summary" && (
        <img
          alt="close"
          src={closeUrl}
          style={closeStyle}
          onClick={removeOverlay}
        />
      )}
    </>
  );
}

export default CouncilOverlays;
