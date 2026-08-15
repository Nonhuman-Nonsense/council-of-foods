import { type CSSProperties, type ReactElement, useRef } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";
import { LiveAudioVisualizerPair } from "@council/humanInput/LiveAudioVisualizer";
import { useMobile } from "@/utils";

import { z } from "@/zIndexLayers";
import ConversationControlIcon from "@/council/ConversationControlIcon";

/** Matches HumanInput center viz slot height (desktop). */
const VIZ_SLOT_HEIGHT_PX = 56;

export type RealtimeSubtitleLayout = "council" | "compact";

/**
 * - `connecting` — session not ready yet; shows a spinner and ignores clicks.
 * - `off` — ready (or the agent is off entirely); click hands over the mic.
 * - `on` — mic is live and being sent; click releases it.
 */
export type MicButtonState = "connecting" | "off" | "on";

export type RealtimeCaptionOverlayProps = {
  lastCaption: string | null;
  lastUserTranscript: string | null;
  subtitleLayout?: RealtimeSubtitleLayout;
  /** Reserve the bottom mic/visualiser row. */
  showMicRow?: boolean;
  micStream?: MediaStream | null;
  micActive?: boolean;
  /**
   * Turns the centre slot into a working mic toggle (web). Left unset in museum,
   * where the hardware button owns the mic and the icon is a pure indicator.
   */
  micButton?: {
    state: MicButtonState;
    onClick: () => void;
    label?: string;
  };
  /** Hide caption text while reconnecting (e.g. language switch). Errors still show. */
  hideCaptions?: boolean;
};

/**
 * Shared caption UI for realtime voice sessions (setup agent, meta agent).
 * PTT hint banner is rendered globally via ButtonBanner.
 */
export default function RealtimeCaptionOverlay(props: RealtimeCaptionOverlayProps): ReactElement {
  const {
    lastCaption,
    lastUserTranscript,
    subtitleLayout = "compact",
    showMicRow = false,
    micStream = null,
    micActive = false,
    micButton,
    hideCaptions = false,
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

  const hasText = !hideCaptions && Boolean(lastUserTranscript || lastCaption);

  const textBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    textAlign: "center",
    minHeight: isMobile ? "56px" : "64px",
    pointerEvents: hasText ? "auto" : "none",
    userSelect: "text",
    marginBottom: isMobile ? "4px" : "8px",
  };

  const vizSlotSize = isMobile ? 45 : VIZ_SLOT_HEIGHT_PX;

  const vizHostStyle: CSSProperties = {
    height: vizSlotSize,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // An interactive mic button is the affordance for talking at all, so it stays
  // on screen; the museum indicator only appears while the mic is actually live.
  const rowVisible = micButton != null || (showMicRow && micActive);

  const vizRowStyle: CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    minHeight: vizSlotSize,
    visibility: rowVisible ? "visible" : "hidden",
    pointerEvents: micButton != null ? "auto" : "none",
  };

  const showVisualizer = micActive && micStream != null;

  return (
    <div style={captionContainerStyle} data-subtitle-layout={subtitleLayout}>
      <div style={textBlockStyle} aria-live="polite">
        {hasText ? (
          <>
            {lastUserTranscript ? (
              <p style={{ ...secondaryStyle, margin: 0 }} data-testid="agent-user">
                {lastUserTranscript}
              </p>
            ) : null}
            {lastCaption ? (
              <p
                style={{ ...paragraphStyle, margin: lastUserTranscript ? "8px 0 0" : 0 }}
                data-testid="agent-caption"
              >
                {lastCaption}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={vizRowStyle} data-testid="realtime-ptt-viz-row">
        <div
          ref={vizLeftHostRef}
          style={{ ...vizHostStyle, width: "100px", transform: "scale(-1, -1)" }}
        />
        <div
          style={{ ...vizHostStyle, width: vizSlotSize }}
          aria-hidden={micButton == null}
          data-testid={micButton ? "realtime-mic-button" : undefined}
          data-mic-state={micButton?.state}
        >
          {micButton ? (
            micButton.state === "connecting" ? (
              <Lottie
                play
                loop
                animationData={loadingAnimation}
                style={{ height: vizSlotSize }}
              />
            ) : (
              <ConversationControlIcon
                icon={micButton.state === "on" ? "record_voice_on" : "record_voice_off"}
                tooltip={micButton.label}
                onClick={micButton.onClick}
              />
            )
          ) : showMicRow ? (
            <ConversationControlIcon icon="record_voice_on" onClick={() => undefined} />
          ) : null}
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
    </div>
  );
}
