import React from "react";

function ConversationControls({ isPaused, onPauseResume, onSkipForward }) {
  return (
    <div style={{ pointerEvents: "auto" }}>
      <button onClick={onPauseResume}>{isPaused ? "Resume" : "Pause"}</button>
      <button onClick={onSkipForward}>Skip forward</button>
    </div>
  );
}

export default ConversationControls;
