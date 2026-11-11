import { type CSSProperties, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import ConversationControlIcon from "@council/ConversationControlIcon";
import { LiveAudioVisualizer } from "@council/humanInput/LiveAudioVisualizer";
import RealtimeCaptionOverlay, {
  RealtimeMicButton,
  type MicButtonState,
  type RealtimeMicButtonProps,
  type RealtimeSubtitleLayout,
} from "@realtime/RealtimeCaptionOverlay";
import { useMobile, usePortrait } from "@/utils";
import { z } from "@/zIndexLayers";
import BottomBar, { CornerSlot, useCorner } from "@main/BottomBar";
import ButtonBanner from "@museum/button/ButtonBanner";

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
 * controls — a hold-to-talk mic button and a volume toggle in the corner (turn
 * the agent off entirely, tearing down the session). The mic sits at the bottom
 * centre, except on a phone, where the centre belongs to the page's own buttons
 * and the mic goes beside the volume toggle instead.
 */
export default function SetupAgentOverlay(props: SetupAgentOverlayProps): ReactElement | null {
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
  const isPortrait = usePortrait();
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

  const micButton: RealtimeMicButtonProps | undefined =
    browserUi && onMicPress
      ? {
          state: micButtonState,
          onPress: () => onMicPress(true),
          onRelease: () => onMicPress(false),
          label: t("agent.micHold"),
          hint: showHoldHint ? t("ptt.holdHint") : null,
        }
      : undefined;
  const micInCorner = isMobile && micButton != null;
  const corner = useCorner();

  // One row along the bottom edge, like the fullscreen button opposite: the volume
  // toggle at the edge, and on a phone the mic beside it with its bars running
  // towards the middle.
  const cornerRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: corner.inset,
  };

  const micRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  // A phone held upright gets only the rotate prompt (the landing's own, or the
  // overlay over the setup pages), with no controls for a screen it can't use.
  if (isPortrait) return null;

  // Left corner: the volume toggle, and on a phone the mic beside it. Centre: the
  // captions (and the mic row on desktop). The right corner stays free for the
  // fullscreen button. Under them, the setup screens' marquee banner.
  return (
    <BottomBar
      zIndex={z.setupAgent}
      left={
        browserUi ? (
          <div style={cornerRowStyle}>
            <CornerSlot>
              {/* No spinner here: this is a standing intention, clickable from
                  first paint whatever the session is doing. */}
              <ConversationControlIcon
                icon={muted ? "volume_off" : "volume_on"}
                tooltip={muted ? t("agent.turnOn") : t("agent.turnOff")}
                onClick={muted ? onStart : onStop}
                size={corner.size}
              />
            </CornerSlot>
            {micInCorner && micButton ? (
              <div style={micRowStyle} data-testid="realtime-mic-button" data-mic-state={micButton.state}>
                <CornerSlot>
                  <RealtimeMicButton micButton={micButton} size={corner.size} spinnerSize={corner.size} />
                </CornerSlot>
                {/* One side of the visualiser, inside the corner's reserved width.
                    Only once audio is flowing, as with the centre row's. */}
                {micLive && micStream ? (
                  <LiveAudioVisualizer stream={micStream} width={30} height={corner.size - 4} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null
      }
      centre={
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
          micButton={micInCorner ? undefined : micButton}
          hint={micInCorner ? micButton?.hint : null}
        />
      }
      banner={<ButtonBanner />}
    />
  );
}
