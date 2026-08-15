import { type CSSProperties, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import ConversationControlIcon from "@council/ConversationControlIcon";
import RealtimeCaptionOverlay, {
  type MicButtonState,
  type RealtimeSubtitleLayout,
} from "@realtime/RealtimeCaptionOverlay";
import { useMobile } from "@/utils";
import type { AgentMode } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";

type SetupAgentOverlayProps = {
  isConnecting: boolean;
  isReady: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  isMuseumMode?: boolean;
  agentMode?: AgentMode;
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
    isReady,
    lastCaption,
    lastUserTranscript,
    muted,
    isMuseumMode = false,
    agentMode = "always-on",
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

  // Off is a real state, not a spinner: the session is torn down, and clicking
  // the mic starts everything again. Only a live-but-not-ready session waits.
  const micButtonState: MicButtonState = muted ? "off" : !isReady ? "connecting" : micOn ? "on" : "off";

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
        showMicRow={agentMode === "ptt"}
        micStream={micStream}
        micActive={isMuseumMode ? micActive : micOn}
        micButton={
          !isMuseumMode && onToggleMic
            ? {
                state: micButtonState,
                onClick: onToggleMic,
                label: micOn ? t("agent.micStop") : t("agent.micStart"),
              }
            : undefined
        }
      />

      {!isMuseumMode ? (
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
