import React from "react";

function ConversationControls({
  isPaused,
  onPauseResume,
  onSkipForward,
  onRaiseHandOrNevermind,
  isRaisedHand,
}) {
  return (
    <div style={{ pointerEvents: "auto" }}>
      <button onClick={onPauseResume}>{isPaused ? "Resume" : "Pause"}</button>
      <button onClick={onSkipForward}>Skip forward</button>
      <button onClick={onRaiseHandOrNevermind}>
        {isRaisedHand ? "Nevermind" : "Raise hand"}
      </button>
    </div>
  );
}

export default ConversationControls;
