import { useMemo } from "react";
import {
  useRealtimeVoiceSession,
  type RealtimeVoiceSessionConnectionState,
} from "@realtime/useRealtimeVoiceSession";
import type { ConfigureSessionOptions } from "@voice/realtimeEventLoop";
import type { RealtimeTool, ToolHandler } from "@voice/guideTools";

/** Meta-agent lifecycle phase. Extension activation lands in PR 3b. */
export type MetaAgentPhase = "inactive" | "interruption" | "extension";

export type MetaAgentConnectionState = RealtimeVoiceSessionConnectionState;

export type UseMetaAgentParams = {
  language: string;
  liveKey: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  onSessionReady?: () => void;
};

export type UseMetaAgentResult = {
  connectionState: MetaAgentConnectionState;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  micStream: MediaStream | null;
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
 */
export function useMetaAgent(params: UseMetaAgentParams): UseMetaAgentResult {
  const { language, liveKey, instructions, tools, toolHandlers, onSessionReady } = params;
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
    onSessionReady,
    defaultsNotLoadedError: "Meta-agent defaults not loaded",
    connectionLostMessage: "Meta-agent connection lost",
    startFailedMessage: "Meta-agent failed to start",
  });
}
