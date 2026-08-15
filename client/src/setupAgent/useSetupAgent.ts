import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** What the agent's instructions and tools are allowed to depend on. */
export type SetupAgentContext = {
  /**
   * The visitor's microphone is live right now. False on web until they press
   * the mic button — the agent then comments rather than converses.
   */
  canHearVisitor: boolean;
  /**
   * The visitor has spoken at least once this session. A latch: it never goes
   * back to false, so the tools the agent earned by being spoken to survive the
   * mic being switched off again.
   */
  hasEverHeardVisitor: boolean;
};

/**
 * Told to the agent in-conversation when the microphone changes hands. A
 * `session.update` changes what the agent *is* but never tells it that anything
 * *happened*, so without these it keeps narrating in the wrong register.
 */
const MIC_ON_MESSAGE =
  "(The visitor just turned their microphone on. You can hear them now — greet them briefly and let them lead.)";
const MIC_OFF_MESSAGE =
  "(The visitor just turned their microphone off. You can no longer hear them — go back to commenting on what they do on screen, and do not ask them anything.)";

export type UseSetupAgentParams = {
  language: string;
  /**
   * Built from the live context rather than passed as a value: whether the
   * agent can hear the visitor changes both what it is told and what it may do,
   * and that state lives in here.
   */
  instructions: (ctx: SetupAgentContext) => string;
  tools: (ctx: SetupAgentContext) => RealtimeTool[];
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
  /** True when the agent can actually hear the visitor (museum, or web mic on). */
  canHearVisitor: boolean;
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
    instructions: buildInstructions,
    tools: buildTools,
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

  // Museum always has a microphone (hardware button or always-on); on web it
  // arrives only when the visitor asks for it.
  const canHearVisitor = isMuseumMode || micOn;
  const [hasEverHeardVisitor, setHasEverHeardVisitor] = useState(isMuseumMode);

  useEffect(() => {
    if (canHearVisitor) setHasEverHeardVisitor(true);
  }, [canHearVisitor]);

  const instructions = useMemo(
    () => buildInstructions({ canHearVisitor, hasEverHeardVisitor }),
    [buildInstructions, canHearVisitor, hasEverHeardVisitor],
  );
  const tools = useMemo(
    () => buildTools({ canHearVisitor, hasEverHeardVisitor }),
    [buildTools, canHearVisitor, hasEverHeardVisitor],
  );

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

  /**
   * Hand the microphone over, or take it back, on a live session: push the
   * updated instructions and tools, then say what happened.
   *
   * The `session.update` alone would leave the agent holding a new brief with
   * no idea it changed — it would keep talking in the old register until
   * something else provoked a response, which for a visitor who just pressed
   * the mic button looks like being ignored.
   *
   * Skips the first pass after each connect: the session was already configured
   * with the current context when the channel opened.
   */
  const configuredForRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isReady) {
      configuredForRef.current = null;
      return;
    }
    if (configuredForRef.current === null) {
      configuredForRef.current = canHearVisitor;
      return;
    }
    if (configuredForRef.current === canHearVisitor) return;
    configuredForRef.current = canHearVisitor;

    // Order matters: reconfigure first, so the agent reacts to the news while
    // already holding the matching brief and tools. The event loop defers the
    // response until the provider acks `session.updated`.
    session.reconfigureSession();

    if (canHearVisitor) {
      // They just asked for attention — barge in if mid-sentence and answer.
      session.interruptAndRespond(MIC_ON_MESSAGE, "mic-on");
    } else {
      // They asked for less. Update the record, but stay quiet until the next
      // thing they do on screen.
      session.sendUserMessage(MIC_OFF_MESSAGE);
    }
  }, [
    isReady,
    canHearVisitor,
    session.reconfigureSession,
    session.interruptAndRespond,
    session.sendUserMessage,
  ]);

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
    canHearVisitor,
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
