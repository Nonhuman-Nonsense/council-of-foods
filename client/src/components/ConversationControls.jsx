import React from "react";
import ConversationControlIcon from './ConversationControlIcon';

function ConversationControls({
  isPaused,
  onPauseResume,
  isMuted,
  onSkipForward,
  onRaiseHandOrNevermind,
  onMuteUnmute,
  onSubmit,
  isRaisedHand,
  humanInterjection,
}) {


  const controlsWrapper = {
    position: "absolute",
    bottom: "0",
    display: "flex",
    flexDirection: "row",
    pointerEvents: "auto",
  }

  return (
    <div style={controlsWrapper}>
      {/* <button onClick={onPauseResume}>{isPaused ? "Resume" : "Pause"}</button> */}
      <ConversationControlIcon name={isMuted ? "volume_off" : "volume_on"} tooltip={"Mute"} onClick={onMuteUnmute} />
      {!humanInterjection && (
        <>
          <ConversationControlIcon name={"backward"} tooltip={"Previous"} />
          <ConversationControlIcon name={"play"} tooltip={"Play"} onClick={onPauseResume} />
          <ConversationControlIcon name={"forward"} tooltip={"forward"} onClick={onSkipForward} />
        </>
      )}
      {humanInterjection && <button onClick={onSubmit}>Submit</button>}
      <ConversationControlIcon name={isRaisedHand ? "Nevermind" : "raise_hand_not_raised"} tooltip={"Raise hand"} onClick={onRaiseHandOrNevermind} />
    </div>
  );
}

export default ConversationControls;
