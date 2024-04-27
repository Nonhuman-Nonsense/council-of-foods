import React from "react";
import ConversationControlIcon from './ConversationControlIcon';

function ConversationControls({
  isPaused,
  onPausePlay,
  isMuted,
  onSkipForward,
  onSkipBackward,
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
      <ConversationControlIcon name={isMuted ? "volume_off" : "volume_on"} tooltip={"Mute"} onClick={onMuteUnmute} />
      {!humanInterjection && (
        <>
          <ConversationControlIcon name={"backward"} tooltip={"Backward"} onClick={onSkipBackward} />
          <ConversationControlIcon name={isPaused ? "play" : "pause"} tooltip={isPaused? "Play" : "Pause"} onClick={onPausePlay} />
          <ConversationControlIcon name={"forward"} tooltip={"Forward"} onClick={onSkipForward} />
        </>
      )}
      {humanInterjection && <button onClick={onSubmit}>Submit</button>}
      <ConversationControlIcon name={isRaisedHand ? "Nevermind" : "raise_hand_not_raised"} tooltip={"Raise hand"} onClick={onRaiseHandOrNevermind} />
    </div>
  );
}

export default ConversationControls;
