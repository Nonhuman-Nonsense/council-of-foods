import { useCallback, useEffect, useState } from "react";
import { getRealtimeRetryPolicy, useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";
import type { AgentMode } from "@/settings/councilSettings";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { setConnectionError, setUnrecoverableError } from "@main/overlay/errorStore";

export type UseVoiceGuideParams = {
  language: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  audioElement?: HTMLAudioElement | null;
  autoStart?: boolean;
  initialMuted?: boolean;
  agentMode?: AgentMode;
  micOpen?: boolean;
  isMuseumMode?: boolean;
};

export type VoiceGuideState = {
  isConnecting: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  agentSpeaking: boolean;
  micStream: MediaStream | null;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  sendUserMessage: (text: string) => void;
  requestAgentResponse: () => void;
};

/**
 * Setup voice guide: thin wrapper around {@link useRealtimeVoiceSession}.
 */
export function useVoiceGuide(params: UseVoiceGuideParams): VoiceGuideState {
  const {
    language,
    instructions,
    tools,
    toolHandlers,
    audioElement,
    autoStart = true,
    initialMuted = false,
    agentMode = "always-on",
    micOpen = false,
    isMuseumMode = false,
  } = params;

  const [muted, setMuted] = useState(initialMuted);
  const pttMic = agentMode === "ptt";

  const onConnectionLost = useCallback(() => {
    if (isMuseumMode) setConnectionError("voice-guide", true);
  }, [isMuseumMode]);

  const onConnectionRestored = useCallback(() => {
    if (isMuseumMode) setConnectionError("voice-guide", false);
  }, [isMuseumMode]);

  const session = useRealtimeVoiceSession({
    feature: "voice-guide",
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady: true,
    pttMic,
    trackAgentSpeaking: true,
    audioElement,
    sessionActive: !muted,
    autoConnect: autoStart,
    isMuseumMode,
    retryPolicy: getRealtimeRetryPolicy(isMuseumMode),
    onFatalError: (e) => setUnrecoverableError({ message: e.message, source: e.source, cause: e.cause }),
    onConnectionLost,
    onConnectionRestored,
    onExhausted: () => setMuted(true),
  });

  useEffect(() => {
    if (agentMode !== "ptt" || muted) return;
    session.setMicEnabled(micOpen);
  }, [agentMode, micOpen, muted, session.setMicEnabled]);

  const stop = useCallback(() => {
    setMuted(true);
  }, []);

  return {
    isConnecting:
      session.connectionState === "connecting" ||
      (session.connectionState === "ready" && !session.hasReceivedAudioPart),
    lastCaption: session.lastCaption,
    lastUserTranscript: session.lastUserTranscript,
    micStream: session.micStream,
    muted,
    setMuted,
    start: async () => {
      setMuted(false);
    },
    stop,
    agentSpeaking: session.agentSpeaking,
    sendUserMessage: session.sendUserMessage,
    requestAgentResponse: session.requestAgentResponse,
  };
}
