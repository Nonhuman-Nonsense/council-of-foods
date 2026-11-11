import { type CSSProperties, type ReactElement, useRef } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";
import { LiveAudioVisualizerPair } from "@council/humanInput/LiveAudioVisualizer";
import { useMobile, useMobileXs } from "@/utils";

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

export type RealtimeMicButtonProps = {
  state: MicButtonState;
  onPress: () => void;
  onRelease: () => void;
  label?: string;
  /** Shown above the button for a moment after a click that should have been a hold. */
  hint?: string | null;
};

/**
 * The hold-to-talk button itself: a spinner while connecting, else the mic icon.
 * The overlay puts it in its centre row; the setup agent puts it in its corner
 * stack on a phone, where the centre is needed for the page's own buttons.
 */
export function RealtimeMicButton({ micButton, size, spinnerSize }: {
  micButton: RealtimeMicButtonProps;
  /** Passed on to ConversationControlIcon; unset keeps its own default. */
  size?: number;
  spinnerSize: number;
}): ReactElement {
  return micButton.state === "connecting" ? (
    <Lottie play loop animationData={loadingAnimation} style={{ height: spinnerSize }} />
  ) : (
    <ConversationControlIcon
      icon={micButton.state === "on" ? "record_voice_on" : "record_voice_off"}
      tooltip={micButton.label}
      hold={{ onPress: micButton.onPress, onRelease: micButton.onRelease }}
      size={size}
    />
  );
}

export type RealtimeCaptionOverlayProps = {
  lastCaption: string | null;
  lastUserTranscript: string | null;
  subtitleLayout?: RealtimeSubtitleLayout;
  /** Reserve the bottom mic/visualiser row. */
  showMicRow?: boolean;
  micStream?: MediaStream | null;
  micActive?: boolean;
  /**
   * Turns the centre slot into a working hold-to-talk button (web). Left unset in museum,
   * where the hardware button owns the mic and the icon is a pure indicator.
   */
  micButton?: RealtimeMicButtonProps;
  /** A hold hint for a mic button the caller renders somewhere else. */
  hint?: string | null;
  /** Hide caption text while reconnecting (e.g. language switch). Errors still show. */
  hideCaptions?: boolean;
  /**
   * Standing explanation for a wait, shown in place of captions and in the
   * smaller size the visitor's own words use — it is about the session, not
   * something the agent said.
   */
  notice?: string | null;
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
    notice = null,
    hint = null,
  } = props;
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  // A phone in landscape has no height to spare under the setup pages: the
  // compact captions shrink to a low strip, and on the smallest screens they
  // go altogether (the agent is still heard). The council layout is a screen
  // of its own and keeps its size.
  const phoneStrip = isMobile && subtitleLayout === "compact";
  const captionsHidden = hideCaptions || (phoneStrip && isMobileXs);

  const vizLeftHostRef = useRef<HTMLDivElement>(null);
  const vizRightHostRef = useRef<HTMLDivElement>(null);

  const agentFontSize = subtitleLayout === "council"
    ? (isMobile ? "18px" : "25px")
    : (isMobile ? "15px" : "20px");

  const userFontSize = phoneStrip ? "13px" : isMobile ? "15px" : "18px";

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
    // On a phone, stay clear of the corner controls on both sides.
    maxWidth: phoneStrip ? "calc(100% - 140px)" : isMobile ? "92%" : "70%",
    width: "100%",
    color: "white",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const holdHint = micButton?.hint ?? hint;
  const hasText = Boolean(notice) || Boolean(holdHint) || (!captionsHidden && Boolean(lastUserTranscript || lastCaption));

  const textBlockStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    textAlign: "center",
    minHeight: phoneStrip ? 0 : isMobile ? "56px" : "64px",
    pointerEvents: hasText ? "auto" : "none",
    userSelect: "text",
    marginBottom: phoneStrip ? "8px" : isMobile ? "4px" : "8px",
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
  // The phone strip has no row to hold when nothing goes in it.
  const rowRendered = !(phoneStrip && micButton == null && !showMicRow);

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
        {notice ? (
          <p style={{ ...secondaryStyle, margin: 0 }} data-testid="agent-notice">
            {notice}
          </p>
        ) : holdHint ? (
          <p style={{ ...secondaryStyle, margin: 0 }} data-testid="agent-hold-hint">
            {holdHint}
          </p>
        ) : hasText ? (
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

      {rowRendered && <div style={vizRowStyle} data-testid="realtime-ptt-viz-row">
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
            <RealtimeMicButton micButton={micButton} spinnerSize={vizSlotSize} />
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
      </div>}
    </div>
  );
}
