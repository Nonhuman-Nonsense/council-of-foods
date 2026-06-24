import { type CSSProperties, type ReactElement } from "react";
import MarqueeRollingBanner from "@council/MarqueeRollingBanner";
import { Icons } from "@assets/icons";
import { useMobile } from "@/utils";
import { useTranslation } from "react-i18next";

/** Short PTT copy needs many segments so the marquee fills the viewport. */
const BUTTON_HINT_SEGMENT_COUNT = 14;

export type RealtimeCaptionOverlayProps = {
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  pushToTalkMode?: boolean;
  showHoldToSpeakHint?: boolean;
  /** i18n key for the hold-to-speak banner (default: setup.holdToSpeak). */
  holdToSpeakKey?: string;
};

/**
 * Shared caption + PTT hint UI for realtime voice sessions (voice guide, meta agent).
 * Presentation only — no WebRTC or session controls.
 */
export default function RealtimeCaptionOverlay(props: RealtimeCaptionOverlayProps): ReactElement {
  const {
    error,
    lastCaption,
    lastUserTranscript,
    pushToTalkMode = false,
    showHoldToSpeakHint = false,
    holdToSpeakKey = "setup.holdToSpeak",
  } = props;
  const isMobile = useMobile();
  const { t } = useTranslation();

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
    zIndex: 4,
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

  const hasText = Boolean(lastUserTranscript || lastCaption);
  const holdToSpeakMessage = t(holdToSpeakKey);

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
            segmentCount={BUTTON_HINT_SEGMENT_COUNT}
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
    </>
  );
}
