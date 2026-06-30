import { type CSSProperties, type ReactElement, useRef } from "react";
import { LiveAudioVisualizerPair } from "@council/humanInput/LiveAudioVisualizer";
import { useMobile } from "@/utils";

import { z } from "@/zIndexLayers";
import ConversationControlIcon from "@/council/ConversationControlIcon";

/** Matches HumanInput center viz slot height (desktop). */
const VIZ_SLOT_HEIGHT_PX = 56;

export type RealtimeSubtitleLayout = "council" | "compact";

export type RealtimeCaptionOverlayProps = {
  lastCaption: string | null;
  lastUserTranscript: string | null;
  subtitleLayout?: RealtimeSubtitleLayout;
  /** Reserve bottom viz row (PTT sessions). */
  showPttVisualizer?: boolean;
  micStream?: MediaStream | null;
  micActive?: boolean;
};

/**
 * Shared caption UI for realtime voice sessions (voice guide, meta agent).
 * PTT hint banner is rendered globally via ButtonBanner.
 */
export default function RealtimeCaptionOverlay(props: RealtimeCaptionOverlayProps): ReactElement {
  const {
    lastCaption,
    lastUserTranscript,
    subtitleLayout = "compact",
    showPttVisualizer = false,
    micStream = null,
    micActive = false,
  } = props;
  const isMobile = useMobile();

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
  const showVisualizer = micActive && micStream != null;

  return (
    <div style={captionContainerStyle} data-subtitle-layout={subtitleLayout}>
      <div style={textBlockStyle} aria-live="polite">
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
    </div>
  );
}
