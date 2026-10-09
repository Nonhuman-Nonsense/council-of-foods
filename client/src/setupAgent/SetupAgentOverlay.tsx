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
  /** Explanation for a long wait, shown in place of captions. */
  notice?: string | null;
  subtitleLayout?: RealtimeSubtitleLayout;
  micStream?: MediaStream | null;
  /**
   * The visitor is holding the talk button, whether or not audio is flowing yet.
   * Drives the mic button's "on" and museum's visualiser row (raw press — the mic is
   * already attached there, so there is no gap to hide).
   */
  micRequested?: boolean;
  /**
   * A real getUserMedia/attach call is outstanding — independent of
   * `micRequested`: the permission prompt itself can blur the window and
   * clear the ask while this is still true, and the spinner should keep
   * showing real work happening either way.
   */
  micAttaching?: boolean;
  /** The on-screen mic button held (true) or let go. */
  onMicPress?: (down: boolean) => void;
  /** Show "hold the button down" — the visitor just clicked it instead. */
  showHoldHint?: boolean;
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
    notice = null,
    subtitleLayout = "compact",
    micStream = null,
    micRequested = false,
    micAttaching = false,
    onMicPress,
    showHoldHint = false,
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

  // Two real waits are shown as "connecting": the whole session still settling, and
  // an attach call outstanding (`micAttaching` — true through the permission prompt).
  // Not the one render between a press and `micStream` catching up: the button is held
  // down at that moment, and swapping it for a spinner would take it from under the finger.
  const micButtonState: MicButtonState = muted
    ? "off"
    : isConnecting || micAttaching
      ? "connecting"
      : micRequested
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
        notice={notice}
        subtitleLayout={subtitleLayout}
        showMicRow={showMicRow}
        micStream={micStream}
        // Web: wait for audio to actually be flowing, not just requested —
        // showing this on the gesture alone is what swallowed the first
        // second of speech into an untethered track.
        micActive={browserUi ? micLive : micRequested}
        micButton={
          browserUi && onMicPress
            ? {
                state: micButtonState,
                onPress: () => onMicPress(true),
                onRelease: () => onMicPress(false),
                label: t("agent.micHold"),
                hint: showHoldHint ? t("ptt.holdHint") : null,
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
