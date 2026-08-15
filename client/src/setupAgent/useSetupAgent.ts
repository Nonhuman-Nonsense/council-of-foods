import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeRetryPolicy, useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";
import type { AgentMode } from "@/settings/councilSettings";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { setConnectionError, setUnrecoverableError } from "@main/overlay/errorStore";
import {
  openMicNotice,
  refreshMicAvailability,
  useMicAvailabilityStore,
} from "@realtime/micAvailabilityStore";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";

export type UseSetupAgentParams = {
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
  /** Gates the first web connect — see `canAutoConnect` below. */
  phase?: MeetingSetupPhase;
};

export type SetupAgentState = {
  isConnecting: boolean;
  /** Session is live and able to take a microphone. */
  isReady: boolean;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  agentSpeaking: boolean;
  micStream: MediaStream | null;
  /** True when the visitor has handed over their microphone (web). */
  micOn: boolean;
  /** Web mic control: turns the agent on first if it was off. */
  toggleMic: () => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  sendUserMessage: (text: string) => void;
  requestAgentResponse: () => void;
  interruptAndRespond: (text: string, reason?: string) => void;
};

/**
 * Setup agent: thin wrapper around {@link useRealtimeVoiceSession}.
 *
 * In web mode the session connects **without a microphone** — it comments on
 * what the visitor clicks, and only asks for mic permission when they press the
 * mic button. Museum keeps its mic-up-front, hardware-button behaviour.
 */
export function useSetupAgent(params: UseSetupAgentParams): SetupAgentState {
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
    phase,
  } = params;

  const [muted, setMuted] = useState(initialMuted);
  const [micOn, setMicOn] = useState(false);
  /** Distinguishes a click from an automatic re-attach after a reconnect. */
  const micRequestedByUserRef = useRef(false);
  const pttMic = agentMode === "ptt";
  const micAvailability = useMicAvailabilityStore((s) => s.availability);

  // Learn the permission state up front: it decides whether the agent may greet
  // on the landing page (see canAutoConnect) and whether the mic button will
  // prompt or fail instantly.
  useEffect(() => {
    void refreshMicAvailability();
  }, []);

  /**
   * Autoplay policy, not permission, is what gates the first connect: an agent
   * that talks unprompted needs a user gesture, and "Let's go" is that gesture.
   * A visitor who already granted the microphone has interacted with this origin
   * before, so browsers let us speak straight away and they get greeted on the
   * landing page.
   */
  const canAutoConnect =
    isMuseumMode || phase == null || phase !== "landing" || micAvailability === "granted";

  const onConnectionLost = useCallback(() => {
    if (isMuseumMode) setConnectionError("setup-agent", true);
  }, [isMuseumMode]);

  const onConnectionRestored = useCallback(() => {
    if (isMuseumMode) setConnectionError("setup-agent", false);
  }, [isMuseumMode]);

  const session = useRealtimeVoiceSession({
    feature: "setup-agent",
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady: true,
    pttMic,
    // Web never prompts on connect; the mic arrives later via attachMic().
    deferMic: !isMuseumMode,
    trackAgentSpeaking: true,
    audioElement,
    sessionActive: !muted,
    autoConnect: autoStart && canAutoConnect,
    isMuseumMode,
    retryPolicy: getRealtimeRetryPolicy(isMuseumMode),
    onFatalError: (e) => setUnrecoverableError({ message: e.message, source: e.source, cause: e.cause }),
    onConnectionLost,
    onConnectionRestored,
    onExhausted: () => setMuted(true),
  });

  const isReady = session.connectionState === "ready";

  useEffect(() => {
    if (agentMode !== "ptt" || muted) return;
    session.setMicEnabled(micOpen);
  }, [agentMode, micOpen, muted, session.setMicEnabled]);

  // Hand the mic over once the session can take it. Covers all three routes in:
  // a click while connected, a click that had to start the agent first, and a
  // reconnect after a drop — where the visitor never let go of the mic, so
  // silently dropping it would be the wrong answer.
  useEffect(() => {
    if (isMuseumMode || !micOn || !isReady || session.micStream) return;

    let cancelled = false;
    void (async () => {
      const attached = await session.attachMic();
      if (cancelled) return;
      if (!attached) {
        setMicOn(false);
        // Only explain when they asked for it — an automatic re-attach that
        // fails should not throw an overlay in front of a browsing visitor.
        if (micRequestedByUserRef.current) openMicNotice();
      }
      micRequestedByUserRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [isMuseumMode, micOn, isReady, session.micStream, session.attachMic]);

  const stop = useCallback(() => {
    setMicOn(false);
    micRequestedByUserRef.current = false;
    setMuted(true);
  }, []);

  const toggleMic = useCallback(() => {
    if (micOn) {
      setMicOn(false);
      micRequestedByUserRef.current = false;
      session.detachMic();
      return;
    }
    // Wanting to talk implies wanting to hear the reply, so a mic click also
    // brings the agent back if it was switched off.
    micRequestedByUserRef.current = true;
    setMicOn(true);
    setMuted(false);
  }, [micOn, session.detachMic]);

  return {
    isConnecting:
      session.connectionState === "connecting" ||
      (session.connectionState === "ready" && !session.hasReceivedAudioPart),
    isReady,
    lastCaption: session.lastCaption,
    lastUserTranscript: session.lastUserTranscript,
    micStream: session.micStream,
    micOn,
    toggleMic,
    muted,
    setMuted,
    start: async () => {
      setMuted(false);
    },
    stop,
    agentSpeaking: session.agentSpeaking,
    sendUserMessage: session.sendUserMessage,
    requestAgentResponse: session.requestAgentResponse,
    interruptAndRespond: session.interruptAndRespond,
  };
}
