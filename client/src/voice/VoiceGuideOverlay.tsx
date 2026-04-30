import { type CSSProperties, type ReactElement } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";
import ConversationControlIcon from "@council/ConversationControlIcon";
import { useMobile } from "@/utils";

type VoiceGuideOverlayProps = {
  isConnecting: boolean;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  onStart: () => void;
  onStop: () => void;
};

/**
 * Centered caption area for the setup wizard voice guide, with a single AI
 * toggle button at the bottom. Stopping the guide tears down WebRTC.
 */
export default function VoiceGuideOverlay(props: VoiceGuideOverlayProps): ReactElement {
  const { isConnecting, error, lastCaption, lastUserTranscript, muted, onStart, onStop } = props;
  const isMobile = useMobile();

  const recordingState: "idle" | "loading" | "recording" = muted
    ? "idle"
    : isConnecting
      ? "loading"
      : "recording";

  const paragraphStyle: CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "20px",
    margin: isMobile ? "0" : undefined,
  };

  const secondaryStyle: CSSProperties = {
    ...paragraphStyle,
    fontSize: isMobile ? "15px" : "18px",
    opacity: 0.85,
  };

  const containerStyle: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: "6px",
    transform: "translateX(-50%)",
    zIndex: 9999,
    pointerEvents: "none",
    maxWidth: isMobile ? "92%" : "70%",
    width: "100%",
    color: "white",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const textBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    minHeight: isMobile ? "56px" : "64px",
    pointerEvents: "none",
    marginBottom: isMobile ? "8px" : "12px",
  };

  const controlsRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    minHeight: isMobile ? "45px" : "56px",
  };

  const controlSlotStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  };

  const hasText = Boolean(lastUserTranscript || lastCaption);

  return (
    <div style={containerStyle}>
      <div style={textBlockStyle} aria-live="polite">
        {error ? (
          <p style={{ ...paragraphStyle, color: "#ffb4b4", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}

        {hasText ? (
          <>
            {lastUserTranscript ? (
              <p style={{ ...secondaryStyle, margin: 0 }} data-testid="voice-guide-user">
                {lastUserTranscript}
              </p>
            ) : null}
            {lastCaption ? (
              <p style={{ ...paragraphStyle, margin: lastUserTranscript ? "8px 0 0" : 0 }} data-testid="voice-guide-caption">
                {lastCaption}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={controlsRowStyle}>
        <div style={controlSlotStyle}>
          {recordingState === "loading" ? (
            <Lottie
              play
              loop
              animationData={loadingAnimation}
              style={{ height: isMobile ? 45 : 56 }}
            />
          ) : (
            <ConversationControlIcon
              icon={recordingState === "recording" ? "ai_filled" : "ai"}
              hoverIcon={recordingState === "recording" ? "ai" : "ai_filled"}
              tooltip={recordingState === "recording" ? "Stop voice guide" : "Start voice guide"}
              onClick={recordingState === "recording" ? onStop : onStart}
            />
          )}
        </div>
      </div>
    </div>
  );
}
