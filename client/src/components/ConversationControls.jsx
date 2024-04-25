import React from "react";

function ConversationControls({
  isPaused,
  onPauseResume,
  onSkipForward,
  onRaiseHandOrNevermind,
  onSubmit,
  isRaisedHand,
  humanInterjection,
}) {
  return (
    <div style={{ pointerEvents: "auto" }}>
      {/* <button onClick={onPauseResume}>{isPaused ? "Resume" : "Pause"}</button> */}
      {!humanInterjection && (
        <button onClick={onSkipForward}>Skip forward</button>
      )}
      {humanInterjection && <button onClick={onSubmit}>Submit</button>}
      <button onClick={onRaiseHandOrNevermind}>
        {isRaisedHand ? "Nevermind" : "Raise hand"}
      </button>
    </div>
  );
}

export default ConversationControls;
