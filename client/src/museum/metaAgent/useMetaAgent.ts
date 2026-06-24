import { useMemo } from "react";
import {
  useRealtimeVoiceSession,
  type RealtimeVoiceSessionConnectionState,
} from "@realtime/useRealtimeVoiceSession";
import type { RealtimeTool, ToolHandler } from "@voice/guideTools";

export type MetaAgentConnectionState = RealtimeVoiceSessionConnectionState;

export type UseMetaAgentParams = {
  language: string;
  liveKey: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
};

export type UseMetaAgentResult = {
  connectionState: MetaAgentConnectionState;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  /**
   * True while the meta-agent is producing a voice response.
   * TODO: Today this follows response.created → response.done (generation end), not
   * remote playback end. Refine here (e.g. remote audio analyser) when idle/resume
   * timing needs to track speaker output precisely.
   */
  agentSpeaking: boolean;
  /** Open or close the mic track (track.enabled). No-op if not yet connected. */
  setMicEnabled: (open: boolean) => void;
  /** Inject a user message into the agent conversation (e.g. state snapshot). */
  sendUserMessage: (text: string) => void;
  /** Mute or unmute remote agent audio (e.g. after terminal tools or on re-activate). */
  setAgentOutputMuted: (muted: boolean) => void;
};

/**
 * Meeting meta-agent: thin wrapper around {@link useRealtimeVoiceSession}.
 *
 * - Bootstrap requires a liveKey bearer (museum mode + live meeting only).
 * - Mic gating via `track.enabled` (PTT holds the button).
 * - No opening greeting — agent waits for the visitor.
 * - Connects on mount; tears down on unmount.
 */
export function useMetaAgent(params: UseMetaAgentParams): UseMetaAgentResult {
  const { language, liveKey, instructions, tools, toolHandlers } = params;
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${liveKey}` }),
    [liveKey],
  );

  return useRealtimeVoiceSession({
    feature: "meta-agent",
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady: false,
    authHeaders,
    pttMic: true,
    trackAgentSpeaking: true,
    defaultsNotLoadedError: "Meta-agent defaults not loaded",
    connectionLostMessage: "Meta-agent connection lost",
    startFailedMessage: "Meta-agent failed to start",
  });
}
