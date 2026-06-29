import { type CSSProperties, type ReactElement, useRef } from "react";
import MarqueeRollingBanner from "@council/MarqueeRollingBanner";
import { LiveAudioVisualizerPair } from "@council/humanInput/LiveAudioVisualizer";
import { Icons } from "@assets/icons";
import { useMobile } from "@/utils";
import type { AgentMode } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";
import { useTranslation } from "react-i18next";
import ConversationControlIcon from "@/council/ConversationControlIcon";

/** Short PTT copy needs many segments so the marquee fills the viewport. */
const BUTTON_HINT_SEGMENT_COUNT = 14;

/** Matches HumanInput center viz slot height (desktop). */
const VIZ_SLOT_HEIGHT_PX = 56;

export type RealtimeSubtitleLayout = "council" | "compact";

export type RealtimeCaptionOverlayProps = {
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  agentMode?: AgentMode;
  showHoldToSpeakHint?: boolean;
  /** i18n key for the hold-to-speak banner (default: setup.holdToSpeak). */
  holdToSpeakKey?: string;
  subtitleLayout?: RealtimeSubtitleLayout;
  /** Reserve bottom viz row (PTT sessions). */
  showPttVisualizer?: boolean;
  micStream?: MediaStream | null;
  micActive?: boolean;
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
    agentMode = "off",
    showHoldToSpeakHint = false,
    holdToSpeakKey = "setup.holdToSpeak",
    subtitleLayout = "compact",
    showPttVisualizer = false,
    micStream = null,
    micActive = false,
  } = props;
  const isMobile = useMobile();
  const { t } = useTranslation();

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  const agentFontSize = subtitleLayout === "council"
    ? (isMobile ? "18px" : "25px")
    : (isMobile ? "18px" : "20px");

  const userFontSize = isMobile ? "15px" : "18px";

  const paragraphStyle: CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: agentFontSize,
    margin: isMobile ? "0" : undefined,
  };

  const secondaryStyle: CSSProperties = {
    ...paragraphStyle,
    fontSize: userFontSize,
    opacity: 0.85,
  };

  const captionContainerStyle: CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 0,
    transform: "translateX(-50%)",
    zIndex: z.realtimeCaption,
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
    justifyContent: "flex-end",
    textAlign: "center",
    minHeight: isMobile ? "56px" : "64px",
    pointerEvents: "none",
    marginBottom: showPttVisualizer ? (isMobile ? "4px" : "8px") : (isMobile ? "8px" : "12px"),
  };

  const vizSlotSize = isMobile ? 45 : VIZ_SLOT_HEIGHT_PX;

  const vizHostStyle: CSSProperties = {
    height: vizSlotSize,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const vizRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: vizSlotSize,
    visibility: micActive ? "visible" : "hidden",
    pointerEvents: "none",
  };

  const hasText = Boolean(lastUserTranscript || lastCaption);
  const holdToSpeakMessage = t(holdToSpeakKey);
  const showVisualizer = micActive && micStream != null;

  return (
    <>
      <div style={captionContainerStyle} data-subtitle-layout={subtitleLayout}>
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

        {showPttVisualizer ? (
          <div style={vizRowStyle} data-testid="realtime-ptt-viz-row">
            <div
              ref={vizLeftHostRef}
              style={{ ...vizHostStyle, width: "100px", transform: "scale(-1, -1)" }}
            />
            <div style={{...vizHostStyle, width: vizSlotSize}} aria-hidden>
              <ConversationControlIcon icon="record_voice_on" onClick={() => undefined} />
            </div>
            <div style={{...vizHostStyle, width: "100px"}} ref={vizRightHostRef} />
            {showVisualizer ? (
              <LiveAudioVisualizerPair
                stream={micStream}
                leftHostRef={vizLeftHostRef}
                rightHostRef={vizRightHostRef}
                width={100}
                height={40}
                barWidth={3}
                gap={2}
                barColor="#ffffff"
                smoothingTimeConstant={0.85}
              />
            ) : null}
          </div>
        ) : null}
      </div >

      {
        agentMode === "ptt" ? (
          <div className="bottom-ui-banner-anchor" >
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
        ) : null
      }
    </>
  );
}
