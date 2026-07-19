import { useCallback, useMemo } from "react";
import {
  getRealtimeRetryPolicy,
  useRealtimeVoiceSession,
  type RealtimeVoiceSessionConnectionState,
} from "@realtime/useRealtimeVoiceSession";
import type { ConfigureSessionOptions } from "@realtime/realtimeEventLoop";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { setUnrecoverableError } from "@main/overlay/errorStore";

/** Meta-agent lifecycle phase. */
export type MetaAgentPhase = "inactive" | "interruption" | "extension";

export type MetaAgentConnectionState = RealtimeVoiceSessionConnectionState;

export type UseMetaAgentParams = {
  language: string;
  liveKey: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  onSessionReady?: () => void;
  onConnectionLost?: () => void;
  onConnectionRestored?: () => void;
};

export type UseMetaAgentResult = {
  connectionState: MetaAgentConnectionState;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  micStream: MediaStream | null;
  /**
   * True while the meta-agent is audibly speaking (playback-based via subtitle timings).
   */
  agentSpeaking: boolean;
  /** Open or close the mic track (track.enabled). No-op if not yet connected. */
  setMicEnabled: (open: boolean) => void;
  /** Inject a user message into the agent conversation (e.g. state snapshot). */
  sendUserMessage: (text: string) => void;
  /** Ask the model to respond when no response is in flight. */
  requestAgentResponse: () => void;
  /** Mute or unmute remote agent audio (e.g. after terminal tools or on re-activate). */
  setAgentOutputMuted: (muted: boolean) => void;
  /** Push updated instructions/tools on the live data channel. */
  reconfigureSession: (options?: ConfigureSessionOptions) => void;
};

/**
 * Meeting meta-agent: thin wrapper around {@link useRealtimeVoiceSession}.
 *
 * - Bootstrap requires a liveKey bearer (museum mode + live meeting only).
 * - Mic gating via `track.enabled` (PTT holds the button).
 * - No opening greeting on connect — agent greets when the visitor activates.
 * - Connects on mount; tears down on unmount.
 * - Always treated as critical (infinite retry). The component decides when to
 *   surface a connection error to the user via `onConnectionLost`.
 */
export function useMetaAgent(params: UseMetaAgentParams): UseMetaAgentResult {
  const {
    language,
    liveKey,
    instructions,
    tools,
    toolHandlers,
    onSessionReady,
    onConnectionLost,
    onConnectionRestored,
  } = params;

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${liveKey}` }),
    [liveKey],
  );

  const onFatalError = useCallback(
    (e: { message: string; source: string; cause?: unknown }) => {
      setUnrecoverableError(e);
    },
    [],
  );

  const session = useRealtimeVoiceSession({
    feature: "meta-agent",
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady: false,
    authHeaders,
    pttMic: true,
    trackAgentSpeaking: true,
    onSessionReady,
    isMuseumMode: true,
    retryPolicy: getRealtimeRetryPolicy(true),
    onFatalError,
    onConnectionLost,
    onConnectionRestored,
  });

  return {
    connectionState: session.connectionState,
    lastCaption: session.lastCaption,
    lastUserTranscript: session.lastUserTranscript,
    micStream: session.micStream,
    agentSpeaking: session.agentSpeaking,
    setMicEnabled: session.setMicEnabled,
    sendUserMessage: session.sendUserMessage,
    requestAgentResponse: session.requestAgentResponse,
    setAgentOutputMuted: session.setAgentOutputMuted,
    reconfigureSession: session.reconfigureSession,
  };
}
