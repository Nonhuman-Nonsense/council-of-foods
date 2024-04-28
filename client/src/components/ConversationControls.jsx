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
  onSubmit,
  isRaisedHand,
  humanInterjection,
}) {
  const controlsWrapper = {
    display: "flex",
    flexDirection: "row",
  };

  return (
    <>
      <div style={{ position: "absolute", bottom: "0", pointerEvents: "auto" }}>
        <div style={{ display: "flex", flexDirection: "row" }}>
          <ConversationControlIcon
            name={isMuted ? "volume_off" : "volume_on"}
            tooltip={"Mute"}
            onClick={onMuteUnmute}
          />
          {!humanInterjection && (
            <>
              <ConversationControlIcon
                name={"backward"}
                tooltip={"Backward"}
                onClick={onSkipBackward}
              />
              <ConversationControlIcon
                name={isPaused ? "play" : "pause"}
                tooltip={isPaused ? "Play" : "Pause"}
                onClick={onPausePlay}
              />
              <ConversationControlIcon
                name={"forward"}
                tooltip={"Forward"}
                onClick={onSkipForward}
              />
            </>
          )}
          {humanInterjection && <button onClick={onSubmit}>Submit</button>}
          <ConversationControlIcon
            name={isRaisedHand ? "raise_hand_raised" : "raise_hand_not_raised"}
            tooltip={"Raise hand"}
            onClick={onRaiseHandOrNevermind}
          />
        </div>
        {isRaisedHand && (
          <span
            style={{
              position: "absolute",
              bottom: "16px",
              fontSize: "18px",
              left: "320px",
              width: "150px",
              animation: "1s slideInFade",
              display: "flex",
            }}
          >
            Just a second<div class="loader"></div>
          </span>
        )}
      </div>
    </>
  );
}

export default ConversationControls;
