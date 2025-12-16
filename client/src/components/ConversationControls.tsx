import ConversationControlIcon from "./ConversationControlIcon";
import { useMobile } from "../utils";
import { useTranslation } from "react-i18next";

/**
 * ConversationControls Component
 * 
 * The control bar at the bottom of the screen.
 * Provides playback controls (Play/Pause, Skip) and interaction buttons (Raise Hand).
 * 
 * Core Logic:
 * - **Conditional Rendering**: Displays valid actions based on `canGoBack`, `canRaiseHand`, etc.
 * - **Interjection Feedback**: Shows a "Waiting..." indicator when the user has raised their hand.
 * - **Z-Index**: Adjusts `zIndex` based on `onTopOfOverlay` prop to remain visible over overlays.
 * 
 * @param {Object} props
 * @param {boolean} props.isPaused - Global pause state.
 * @param {Function} props.onPausePlay - Toggle playback.
 * @param {boolean} props.isMuted - Global mute state.
 * @param {Function} props.onSkipForward - Next message handler.
 * @param {Function} props.onSkipBackward - Previous message handler.
 * @param {Function} props.onRaiseHand - Raise hand handler.
 * @param {Function} props.onMuteUnmute - Toggle mute.
 * @param {boolean} props.isRaisedHand - Whether the user has requested to speak.
 * @param {boolean} props.isWaitingToInterject - Whether the system is processing the interruption.
 * @param {boolean} props.canGoBack - History navigation flag.
 * @param {boolean} props.canGoForward - History navigation flag.
 * @param {boolean} props.canRaiseHand - Interaction allowed flag.
 * @param {boolean} props.onTopOfOverlay - Helper to boost z-index.
 * @param {string} props.humanName - Name of human participant for status text.
 */
function ConversationControls({
  isPaused,
  onPausePlay,
  isMuted,
  onSkipForward,
  onSkipBackward,
  onRaiseHand,
  onMuteUnmute,
  isRaisedHand,
  isWaitingToInterject,
  canGoBack,
  canGoForward,
  canRaiseHand,
  onTopOfOverlay,
  humanName
}) {
  const isMobile = useMobile();

  const { t } = useTranslation();

  const divStyle = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
  };

  return (
    <>
      <div style={{ position: "absolute", bottom: "0", pointerEvents: "auto", zIndex: onTopOfOverlay ? "10" : "3" }}>
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
          <div style={{ ...divStyle, pointerEvents: isRaisedHand ? "none" : "auto" }}>
            {!isPaused &&
              canRaiseHand &&
              <ConversationControlIcon
                icon={isRaisedHand ? "raise_hand_filled" : "raise_hand"}
                hoverIcon={isRaisedHand && "raise_hand_filled"}
                tooltip={"Raise hand"}
                onClick={() => { if (!isRaisedHand) { onRaiseHand() } }}
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
              left: isMobile ? "230px" : "285px",
              width: "400px",
              animation: "1s slideInFade",
              opacity: "0.7",
              display: "flex",
            }}
          >
            {humanName}, {t('controls.wait')}<div className="loader"></div>
          </span>
        )}
      </div>
    </>
  );
}

export default ConversationControls;
