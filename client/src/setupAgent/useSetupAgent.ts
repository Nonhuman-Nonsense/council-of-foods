import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRealtimeRetryPolicy, useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";
import type { AgentMode } from "@/settings/councilSettings";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { setConnectionError, setUnrecoverableError } from "@main/overlay/errorStore";
import { useAutoplayAllowed } from "@/audio/canAutoplay";
import { VISITOR_SILENT_SAFE_TOOLS } from "./setupAgentTools";
import { log } from "@/logger";

/** What the agent's instructions are allowed to depend on. */
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
 * Put on the record when the microphone changes hands. Neither asks for a
 * reply: a visitor who just pressed the mic button is about to speak, and an
 * "I can hear you now" would land on top of their first sentence; a visitor who
 * just muted asked for less, not more. The agent only needs to know.
 *
 * They state the fact and nothing else — the prompt carries the rules for each
 * mode, and repeating them here would be a second copy to drift out of step.
 */
const MIC_ON_MESSAGE = "(The visitor just turned their microphone on — you can hear them now.)";
const MIC_OFF_MESSAGE = "(The visitor just turned their microphone off.)";

/** Returned instead of acting when the agent reaches for a tool it should not use yet. */
const TOOL_REFUSED_ERROR =
  "The visitor has not spoken to you yet — they are choosing on screen themselves. Comment on what they do instead.";

export type UseSetupAgentParams = {
  language: string;
  /**
   * Built from the live context rather than passed as a value: what the agent
   * is told depends on whether it can hear the visitor, and that state lives in
   * here. Only read when a session connects — mic changes after that are put on
   * the record in the conversation instead of re-sending the session config.
   */
  instructions: (ctx: SetupAgentContext) => string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  audioElement?: HTMLAudioElement | null;
  autoStart?: boolean;
  initialMuted?: boolean;
  agentMode?: AgentMode;
  micOpen?: boolean;
  isMuseumMode?: boolean;
};

export type SetupAgentState = {
  isConnecting: boolean;
  /**
   * A connection attempt is actually in flight. Distinct from "not ready" —
   * an agent waiting for a gesture before it connects is idle, not pending, and
   * showing a spinner for it would promise something that is never coming.
   */
  isStarting: boolean;
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
  const [micOn, setMicOn] = useState(false);
  /**
   * The visitor pressed something to start the agent. That press is itself the
   * gesture every browser wants before it will play audio, so it opens the gate
   * without waiting on another check.
   */
  const [startedByVisitor, setStartedByVisitor] = useState(false);
  /** Distinguishes a click from an automatic re-attach after a reconnect. */
  const micRequestedByUserRef = useRef(false);
  const pttMic = agentMode === "ptt";
  const autoplayAllowed = useAutoplayAllowed();

  /**
   * An agent that talks unprompted is pointless if the browser will not let it
   * be heard — it would lose its greeting into a blocked element and bill for
   * the session. So the gate is simply whether audio can play: on a cold visit
   * that is false everywhere, and the visitor's first click (anywhere — "Let's
   * go", a topic, the mic button) flips it.
   *
   * Deliberately not keyed on the page: a link pasted straight to the topic
   * step is just as cold as the landing page.
   */
  const canAutoConnect = isMuseumMode || autoplayAllowed || startedByVisitor;

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

  /**
   * The agent always holds every tool, so the session config never has to
   * change — but a visitor who has never spoken is driving the page by hand,
   * and a tool call would move it under them. Refuse instead of acting, with
   * an error the agent can narrate.
   */
  const hasEverHeardVisitorRef = useRef(hasEverHeardVisitor);
  hasEverHeardVisitorRef.current = hasEverHeardVisitor;

  const guardedToolHandlers = useMemo(() => {
    return Object.fromEntries(
      Object.entries(toolHandlers).map(([name, handler]): [string, ToolHandler] => {
        if (VISITOR_SILENT_SAFE_TOOLS.includes(name)) return [name, handler];
        return [
          name,
          (args) => {
            if (!hasEverHeardVisitorRef.current) {
              log.event("REALTIME", "setup agent tool refused", { name });
              return { ok: false, error: TOOL_REFUSED_ERROR };
            }
            return handler(args);
          },
        ];
      }),
    );
  }, [toolHandlers]);

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
    toolHandlers: guardedToolHandlers,
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
   * Put a mic change on the record. Nothing in the session config depends on
   * the microphone, so this is the whole update — no `session.update`, which
   * would also reset the turn machinery and can drop a queued click reaction.
   *
   * Skips the first pass after each connect: the instructions the session
   * opened with already describe the microphone as it was at that moment.
   */
  const announcedMicRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isReady) {
      announcedMicRef.current = null;
      return;
    }
    if (announcedMicRef.current === null) {
      announcedMicRef.current = canHearVisitor;
      return;
    }
    if (announcedMicRef.current === canHearVisitor) return;
    announcedMicRef.current = canHearVisitor;

    // No response requested either way — see the message constants.
    session.sendUserMessage(canHearVisitor ? MIC_ON_MESSAGE : MIC_OFF_MESSAGE);
  }, [isReady, canHearVisitor, session.sendUserMessage]);

  // Hand the mic over once the session can take it. Covers all three routes in:
  // a click while connected, a click that had to start the agent first, and a
  // reconnect after a drop — where the visitor never let go of the mic, so
  // silently dropping it would be the wrong answer.
  useEffect(() => {
    if (isMuseumMode || !micOn || !isReady || session.micStream) return;

    let cancelled = false;
    void (async () => {
      // requestMicrophone explains a failed request the visitor made, and stays
      // quiet for an automatic re-attach after a reconnect.
      const attached = await session.attachMic({
        userInitiated: micRequestedByUserRef.current,
      });
      if (cancelled) return;
      if (!attached) setMicOn(false);
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
    // brings the agent back if it was switched off — or starts it for the first
    // time, on a page where we were still waiting for a gesture.
    micRequestedByUserRef.current = true;
    setMicOn(true);
    setMuted(false);
    setStartedByVisitor(true);
  }, [micOn, session.detachMic]);

  return {
    isConnecting:
      session.connectionState === "connecting" ||
      (session.connectionState === "ready" && !session.hasReceivedAudioPart),
    isStarting: session.connectionState === "connecting",
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
      setStartedByVisitor(true);
    },
    stop,
    agentSpeaking: session.agentSpeaking,
    sendUserMessage: session.sendUserMessage,
    requestAgentResponse: session.requestAgentResponse,
    interruptAndRespond: session.interruptAndRespond,
  };
}
