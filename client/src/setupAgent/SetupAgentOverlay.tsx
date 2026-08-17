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
  /** A connection attempt is in flight — as opposed to simply not started. */
  isStarting: boolean;
  isReady: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  /** The visitor has a pointer: show the mic button and the volume control. */
  browserUi?: boolean;
  /** Museum: show the visualiser row with no on-screen button. */
  showMicRow?: boolean;
  subtitleLayout?: RealtimeSubtitleLayout;
  micStream?: MediaStream | null;
  micActive?: boolean;
  /** Web: the visitor has handed over their microphone. */
  micOn?: boolean;
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
    isStarting,
    isReady,
    lastCaption,
    lastUserTranscript,
    muted,
    browserUi = false,
    showMicRow = false,
    subtitleLayout = "compact",
    micStream = null,
    micActive = false,
    micOn = false,
    onToggleMic,
    onStart,
    onStop,
  } = props;
  const isMobile = useMobile();
  const { t } = useTranslation();

  // Spin only while a connection is genuinely in flight. An agent that is off,
  // or still waiting for the gesture that lets it be heard, reads as "off" and
  // is startable by clicking — a spinner there would promise a connection that
  // nothing is coming for.
  const micButtonState: MicButtonState = muted
    ? "off"
    : isStarting
      ? "connecting"
      : isReady && micOn
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
        micActive={browserUi ? micOn : micActive}
        micButton={
          browserUi && onToggleMic
            ? {
                state: micButtonState,
                onClick: onToggleMic,
                label: micOn ? t("agent.micStop") : t("agent.micStart"),
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
