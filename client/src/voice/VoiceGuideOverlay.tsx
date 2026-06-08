import { type CSSProperties, type ReactElement } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";
import ConversationControlIcon from "@council/ConversationControlIcon";
import MarqueeRollingBanner from "@council/MarqueeRollingBanner";
import { Icons } from "@assets/icons";
import { useMobile } from "@/utils";
import { useTranslation } from "react-i18next";

/** Short PTT copy needs many segments so the marquee fills the viewport. */
const PTT_HINT_SEGMENT_COUNT = 14;

type VoiceGuideOverlayProps = {
  isConnecting: boolean;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  isMuseumMode?: boolean;
  pushToTalkMode?: boolean;
  showHoldToSpeakHint?: boolean;
  onStart: () => void;
  onStop: () => void;
};

/**
 * Centered caption area for the setup wizard voice guide, with a single AI
 * toggle button at the bottom. Stopping the guide tears down WebRTC.
 */
export default function VoiceGuideOverlay(props: VoiceGuideOverlayProps): ReactElement {
  const {
    isConnecting,
    error,
    lastCaption,
    lastUserTranscript,
    muted,
    isMuseumMode = false,
    pushToTalkMode = false,
    showHoldToSpeakHint = false,
    onStart,
    onStop,
  } = props;
  const isMobile = useMobile();
  const { t } = useTranslation();

  const sessionActive = !muted;
  const recordingState: "idle" | "loading" | "recording" = !sessionActive
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

  const captionContainerStyle: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: isMobile ? "0px" : "20px",
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

  const controlContainerStyle: CSSProperties = {
    position: "fixed",
    bottom: "6px",
    left: "5px",
    opacity: 0.7,
    zIndex: 10000,
    pointerEvents: "auto",
  };

  const controlSlotStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  };

  const hasText = Boolean(lastUserTranscript || lastCaption);
  const holdToSpeakMessage = t("setup.holdToSpeak");

  return (
    <>
      <div style={captionContainerStyle}>
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
                <p
                  style={{ ...paragraphStyle, margin: lastUserTranscript ? "8px 0 0" : 0 }}
                  data-testid="voice-guide-caption"
                >
                  {lastCaption}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {pushToTalkMode ? (
        <div className="bottom-ui-banner-anchor">
          <MarqueeRollingBanner
            visible={showHoldToSpeakHint}
            segmentCount={PTT_HINT_SEGMENT_COUNT}
            testId="voice-guide-hold-to-speak"
            renderSegment={(index) => (
              <>
                <Icons.tomato className="marquee-rolling-banner__tomato" aria-hidden={index !== 0} />
                <span aria-hidden={index !== 0}>{holdToSpeakMessage}</span>
                <Icons.tomato className="marquee-rolling-banner__tomato" aria-hidden />
                <span aria-hidden={index !== 0}>{holdToSpeakMessage}</span>
              </>
            )}
          />
        </div>
      ) : null}

      {!isMuseumMode ? (
        <div style={controlContainerStyle}>
          <div style={controlSlotStyle}>
            {recordingState === "loading" ? (
              <Lottie
                play
                loop
                animationData={loadingAnimation}
                style={{ height: isMobile ? 35 : 40 }}
              />
            ) : (
              <ConversationControlIcon
                icon={recordingState === "recording" ? "ai_filled" : "ai"}
                hoverIcon={recordingState === "recording" ? "ai" : "ai_filled"}
                tooltip={recordingState === "recording" ? "Stop voice guide" : "Start voice guide"}
                onClick={recordingState === "recording" ? onStop : onStart}
                size={isMobile ? 30 : 40}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
