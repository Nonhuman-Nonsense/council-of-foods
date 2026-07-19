import { type CSSProperties, type ReactElement } from "react";
import Lottie from "react-lottie-player";
import loadingAnimation from "@assets/animations/loading.json";
import ConversationControlIcon from "@council/ConversationControlIcon";
import RealtimeCaptionOverlay, {
  type RealtimeSubtitleLayout,
} from "@realtime/RealtimeCaptionOverlay";
import { useMobile } from "@/utils";
import type { AgentMode } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";

type SetupAgentOverlayProps = {
  isConnecting: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  muted: boolean;
  isMuseumMode?: boolean;
  agentMode?: AgentMode;
  subtitleLayout?: RealtimeSubtitleLayout;
  micStream?: MediaStream | null;
  micActive?: boolean;
  onStart: () => void;
  onStop: () => void;
};

/**
 * Setup wizard voice guide shell: shared realtime captions + optional web AI toggle.
 * Stopping the guide tears down WebRTC.
 */
export default function SetupAgentOverlay(props: SetupAgentOverlayProps): ReactElement {
  const {
    isConnecting,
    lastCaption,
    lastUserTranscript,
    muted,
    isMuseumMode = false,
    agentMode = "always-on",
    subtitleLayout = "compact",
    micStream = null,
    micActive = false,
    onStart,
    onStop,
  } = props;
  const isMobile = useMobile();

  const sessionActive = !muted;
  const recordingState: "idle" | "loading" | "recording" = !sessionActive
    ? "idle"
    : isConnecting
      ? "loading"
      : "recording";

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
        hideCaptions={isConnecting}
        subtitleLayout={subtitleLayout}
        showPttVisualizer={agentMode === "ptt"}
        micStream={micStream}
        micActive={micActive}
      />

      {!isMuseumMode ? (
        <div style={controlContainerStyle}>
          <div style={controlSlotStyle}>
            {recordingState === "loading" ? (
              <Lottie
                play
                loop
                animationData={loadingAnimation}
                style={{ height: isMobile ? 35 : 40 }}
              />
            ) : (
              <ConversationControlIcon
                icon={recordingState === "recording" ? "ai_filled" : "ai"}
                hoverIcon={recordingState === "recording" ? "ai" : "ai_filled"}
                tooltip={recordingState === "recording" ? "Stop voice guide" : "Start voice guide"}
                onClick={recordingState === "recording" ? onStop : onStart}
                size={isMobile ? 30 : 40}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
