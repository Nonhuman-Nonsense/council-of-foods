import { type CSSProperties, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import ConversationControlIcon from "@council/ConversationControlIcon";
import RealtimeCaptionOverlay, {
  type MicButtonState,
  type RealtimeSubtitleLayout,
} from "@realtime/RealtimeCaptionOverlay";
import { useMobile } from "@/utils";
import { z } from "@/zIndexLayers";

type SetupAgentOverlayProps = {
  isConnecting: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  /** The visitor has a pointer: show the mic button and the volume control. */
  browserUi?: boolean;
  /** Museum: show the visualiser row with no on-screen button. */
  showMicRow?: boolean;
  subtitleLayout?: RealtimeSubtitleLayout;
  micStream?: MediaStream | null;
  /**
   * The visitor has asked for the mic (gesture), whether or not audio is
   * flowing yet. Drives the toggle label (a click cancels the request either
   * way), museum's visualiser row (raw press — the mic is already attached
   * there, so there is no gap to hide), and web's "connecting" state; web
   * additionally waits for `micStream` before showing "on", since on a first
   * press the track can lag the gesture by however long getUserMedia takes.
   */
  micRequested?: boolean;
  onToggleMic?: () => void;
  onStart: () => void;
  onStop: () => void;
};

/**
 * Setup wizard agent shell: shared realtime captions, plus the two web
 * controls — a mic toggle at the bottom centre (talk to the agent) and a volume
 * toggle in the corner (turn the agent off entirely, tearing down the session).
 */
export default function SetupAgentOverlay(props: SetupAgentOverlayProps): ReactElement {
  const {
    isConnecting,
    lastCaption,
    lastUserTranscript,
    muted,
    browserUi = false,
    showMicRow = false,
    subtitleLayout = "compact",
    micStream = null,
    micRequested = false,
    onToggleMic,
    onStart,
    onStop,
  } = props;
  const isMobile = useMobile();
  const { t } = useTranslation();

  // The one thing SetupAgentOverlay adds on top of what it's told: whether
  // the track handed back with `micStream` is the one being asked for right
  // now. Not a second signal from the caller — `micStream` was already here
  // for the visualiser.
  const micLive = micStream != null;

  // Two separate waits, both shown as "connecting": the whole session still
  // settling (same signal the museum spinner uses, ready-but-silent included —
  // stops early once the page turns out not to be audible, since nothing more
  // is coming until the visitor gives the gesture this button exists to
  // collect), and — once the session itself is fine — the mic-specific gap on
  // a first press, between asking for it and the track actually sending.
  const micButtonState: MicButtonState = muted
    ? "off"
    : isConnecting || (micRequested && !micLive)
      ? "connecting"
      : micLive
        ? "on"
        : "off";

  const controlContainerStyle: CSSProperties = {
    position: "fixed",
    bottom: "6px",
    left: "5px",
    opacity: 0.7,
    zIndex: z.setupAgent,
    pointerEvents: "auto",
  };

  const controlSlotStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  };

  return (
    <>
      <RealtimeCaptionOverlay
        lastCaption={lastCaption}
        lastUserTranscript={lastUserTranscript}
        hideCaptions={isConnecting || muted}
        subtitleLayout={subtitleLayout}
        showMicRow={showMicRow}
        micStream={micStream}
        // Web: wait for audio to actually be flowing, not just requested —
        // showing this on the gesture alone is what swallowed the first
        // second of speech into an untethered track.
        micActive={browserUi ? micLive : micRequested}
        micButton={
          browserUi && onToggleMic
            ? {
                state: micButtonState,
                onClick: onToggleMic,
                // Tracks the request, not the live state: a click cancels the
                // ask whether or not the track has started sending yet.
                label: micRequested ? t("agent.micStop") : t("agent.micStart"),
              }
            : undefined
        }
      />

      {browserUi ? (
        <div style={controlContainerStyle}>
          <div style={controlSlotStyle}>
            {/* No spinner here: this is a standing intention, clickable from
                first paint whatever the session is doing. */}
            <ConversationControlIcon
              icon={muted ? "volume_off" : "volume_on"}
              tooltip={muted ? t("agent.turnOn") : t("agent.turnOff")}
              onClick={muted ? onStart : onStop}
              size={isMobile ? 30 : 40}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
