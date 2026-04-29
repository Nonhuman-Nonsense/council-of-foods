import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@animations/loading.json";
import ConversationControlIcon from "@/components/ConversationControlIcon";
import { useMobile } from "@/utils";

type VoiceGuideOverlayProps = {
  isConnecting: boolean;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  onToggleMuted: () => void;
};

/**
 * Centered caption area for the setup wizard voice guide, with a single mute control
 * (same icon pattern as conversation controls). Mute stops the realtime connection.
 */
export default function VoiceGuideOverlay(props: VoiceGuideOverlayProps): ReactElement {
  const { isConnecting, error, lastCaption, lastUserTranscript, muted, onToggleMuted } = props;
  const isMobile = useMobile();

  const [displayedUserTranscript, setDisplayedUserTranscript] = useState<string | null>(null);

  useEffect(() => {
    if (lastUserTranscript) {
      setDisplayedUserTranscript(lastUserTranscript);
      const timer = setTimeout(() => {
        setDisplayedUserTranscript(null);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setDisplayedUserTranscript(null);
    }
  }, [lastUserTranscript]);


  const paragraphStyle: React.CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "20px",
    margin: isMobile ? "0" : undefined,
  };

  const secondaryStyle: React.CSSProperties = {
    ...paragraphStyle,
    fontSize: isMobile ? "15px" : "18px",
    opacity: 0.85,
  };

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: isMobile ? "24px" : "32px",
    transform: "translateX(-50%)",
    zIndex: 9999,
    pointerEvents: "none",
    maxWidth: isMobile ? "85%" : "70%",
    width: "100%",
    color: "white",
    boxSizing: "border-box",
  };

  const textBlockStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    minHeight: isMobile ? "56px" : "64px",
    pointerEvents: "none",
  };

  const muteButtonStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "6px",
    left: "10px",
    opacity: 0.7,
    zIndex: 10,
    pointerEvents: "auto",
  };

  const showLoading = isConnecting && !muted;
  const hasText = Boolean(lastUserTranscript || lastCaption);

  return (
    <>
      <div style={muteButtonStyle}>
        <ConversationControlIcon
          icon={muted ? "volume_off" : "volume_on"}
          tooltip={muted ? "Unmute" : "Mute"}
          onClick={onToggleMuted}
        />
      </div>

      <div style={containerStyle} aria-live="polite">
        <div style={textBlockStyle}>
          {error ? (
            <p style={{ ...paragraphStyle, color: "#ffb4b4", margin: 0 }} role="alert">
              {error}
            </p>
          ) : null}

          {showLoading ? (
            <Lottie play loop animationData={loadingAnimation} style={{ height: isMobile ? "40px" : "60px" }} />
          ) : null}

          {!showLoading && hasText ? (
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
      </div>
    </>
  );
}
