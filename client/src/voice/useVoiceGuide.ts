import { useCallback, useEffect, useState } from "react";
import { useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";
import type { AgentMode } from "@/settings/councilSettings";
import type { RealtimeTool, ToolHandler } from "./guideTools";

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
};

export type VoiceGuideState = {
  isConnecting: boolean;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  micStream: MediaStream | null;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  sendUserMessage: (text: string) => void;
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
  } = params;

  const [muted, setMuted] = useState(initialMuted);
  const pttMic = agentMode === "ptt";

  const session = useRealtimeVoiceSession({
    feature: "voice-guide",
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady: true,
    pttMic,
    audioElement,
    sessionActive: !muted,
    autoConnect: autoStart,
    defaultsNotLoadedError: "Voice guide realtime defaults not loaded",
    connectionLostMessage: "Voice guide connection lost",
    startFailedMessage: "Voice guide failed to start",
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
    error: session.error,
    lastCaption: session.lastCaption,
    lastUserTranscript: session.lastUserTranscript,
    micStream: session.micStream,
    muted,
    setMuted,
    start: async () => {
      setMuted(false);
    },
    stop,
    sendUserMessage: session.sendUserMessage,
  };
}
