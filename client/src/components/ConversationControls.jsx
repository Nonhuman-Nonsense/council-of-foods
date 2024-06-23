import React from "react";
import ConversationControlIcon from "./ConversationControlIcon";
import { useMobile } from "../utils";

function ConversationControls({
  isPaused,
  onPausePlay,
  isMuted,
  onSkipForward,
  onSkipBackward,
  onRaiseHandOrNevermind,
  onMuteUnmute,
  isRaisedHand,
  isWaitingToInterject,
  canGoBack,
  canGoForward,
  canRaiseHand,
  onTopOfOverlay
}) {
  const isMobile = useMobile();

  const divStyle = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
  };

  return (
    <>
      <div style={{ display: "none", position: "absolute", bottom: "0", pointerEvents: "auto", zIndex: onTopOfOverlay ? "10" : "3" }}>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={divStyle}>
            {!isPaused &&
            <ConversationControlIcon
              icon={isMuted ? "volume_off" : "volume_on"}
              tooltip={"Mute"}
              onClick={onMuteUnmute}
            />}
          </div>
          <div style={divStyle}>
            {!isPaused &&
              canGoBack &&
              <ConversationControlIcon
              icon={"backward"}
              tooltip={"Backward"}
              onClick={onSkipBackward}
            />}
          </div>
          <div style={divStyle}>
            <ConversationControlIcon
              icon={isPaused ? "play" : "pause"}
              tooltip={isPaused ? "Play" : "Pause"}
              onClick={onPausePlay}
            />
          </div>
          <div style={divStyle}>
          {!isPaused &&
            canGoForward &&
            <ConversationControlIcon
              icon={"forward"}
              tooltip={"Forward"}
              onClick={onSkipForward}
            />}
          </div>
          <div style={divStyle}>
            {!isPaused &&
              canRaiseHand &&
            <ConversationControlIcon
              icon={isRaisedHand ? "raise_hand_filled" : "raise_hand"}
              hoverIcon={isRaisedHand && "raise_hand_filled"}
              tooltip={"Raise hand"}
              onClick={onRaiseHandOrNevermind}
            />}
          </div>
        </div>
        {isWaitingToInterject && (
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              position: "absolute",
              bottom: isMobile ? "12px" : "16px",
              fontSize: isMobile ? "15px" : "18px",
              left: isMobile ? "230px" : "280px",
              width: "160px",
              animation: "1s slideInFade",
              display: "flex",
            }}
          >
            Wait for your turn<div className="loader"></div>
          </span>
        )}
      </div>
    </>
  );
}

export default ConversationControls;
