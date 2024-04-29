import React from "react";
import ConversationControlIcon from "./ConversationControlIcon";

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
  canRaiseHand
}) {


  const divStyle = {
    width: "56px",
    height: "56px",
  };

  return (
    <>
      <div style={{ position: "absolute", bottom: "0", pointerEvents: "auto" }}>
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
              position: "absolute",
              bottom: "16px",
              fontSize: "18px",
              left: "280px",
              width: "150px",
              animation: "1s slideInFade",
              display: "flex",
            }}
          >
            Just a second<div className="loader"></div>
          </span>
        )}
      </div>
    </>
  );
}

export default ConversationControls;
