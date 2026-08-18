import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRealtimeRetryPolicy, useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { setConnectionError, setUnrecoverableError } from "@main/overlay/errorStore";
import { useAutoplayAllowed } from "@/audio/canAutoplay";
import { VISITOR_SILENT_SAFE_TOOLS } from "./setupAgentTools";
import { log } from "@/logger";

/** What the agent's instructions are allowed to depend on. */
export type SetupAgentContext = {
  /**
   * The visitor has had a working microphone at least once this session. A
   * latch: it never goes back to false. Push-to-talk means the mic is shut most
   * of the time even mid-conversation, so the live state is not something the
   * agent should track — once they can talk, they can talk.
   */
  hasEverHeardVisitor: boolean;
};

/**
 * Sent once, the first time the visitor becomes audible mid-session. Instructions
 * are only read when a session connects, so without this the agent would keep
 * the "they cannot speak, comment only" rules it opened with for the rest of the
 * session, no matter what it then hears.
 *
 * Asks for no reply — the visitor who just opened the mic is about to speak, and
 * an "I can hear you now" would land on top of their first sentence. It states
 * the fact and nothing else; the prompt carries the rules.
 */
const VISITOR_AUDIBLE_MESSAGE = "(The visitor can talk to you now.)";

/** Returned instead of acting when the agent reaches for a tool it should not use yet. */
const TOOL_REFUSED_ERROR =
  "The visitor has not spoken to you yet — they are choosing on screen themselves. Comment on what they do instead.";

export type UseSetupAgentParams = {
  language: string;
  /**
   * Built from the live context rather than passed as a value: what the agent
   * is told depends on whether the visitor has ever been audible, and that state
   * lives in here. Only read when a session connects — a later first-contact is
   * put on the record in the conversation instead.
   */
  instructions: (ctx: SetupAgentContext) => string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  audioElement?: HTMLAudioElement | null;
  autoStart?: boolean;
  initialMuted?: boolean;
  /**
   * Acquire the mic at connect and gate it with `setMicEnabled`, rather than
   * deferring until a gesture asks for it (capabilities.micUpFront).
   */
  micUpFront?: boolean;
  /**
   * The visitor wants the mic open right now — held, or latched by a tap or the
   * on-screen button. Single source: the button store owns the gesture, so this
   * hook never keeps a competing copy.
   */
  micOpen?: boolean;
  /** Nobody is present to fix a failure (capabilities.unattended). */
  unattended?: boolean;
};

export type SetupAgentState = {
  isConnecting: boolean;
  /** Session is live and able to take a microphone. */
  isReady: boolean;
  /**
   * The visitor has had a working microphone at least once. Push-to-talk shuts
   * the mic between utterances, so this — not the live mic state — is what says
   * whether the agent may ask them something.
   */
  hasEverHeardVisitor: boolean;
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
    micUpFront = false,
    micOpen = false,
    unattended = false,
  } = params;

  const [muted, setMuted] = useState(initialMuted);
  /**
   * The mic opened because the visitor just asked, rather than because a
   * reconnect found the latch still on. Only a request they made should explain
   * itself with the blocked-microphone overlay.
   */
  const micRequestedByUserRef = useRef(false);
  const autoplayAllowed = useAutoplayAllowed();

  /**
   * Whether the browser would let the agent be heard right now. On a cold visit
   * that is false everywhere, and the visitor's first interaction (anywhere —
   * "Let's go", a topic, the mic button, the space bar) flips it. A kiosk has
   * nobody to interact and is configured to allow audio, so it is always true.
   *
   * This no longer gates *connecting* — the session is built straight away, so
   * the handshake is behind us by the time the visitor first acts, and only the
   * greeting waits. Deliberately not keyed on the page: a link pasted straight
   * to the topic step is as cold as the landing page.
   */
  const audible = unattended || autoplayAllowed;

  // A mic taken up front is always there (museum); a deferred one arrives only
  // when the visitor asks for it, and the latch never goes back.
  const [hasEverHeardVisitor, setHasEverHeardVisitor] = useState(micUpFront);

  useEffect(() => {
    if (micUpFront || micOpen) setHasEverHeardVisitor(true);
  }, [micUpFront, micOpen]);

  const instructions = useMemo(
    () => buildInstructions({ hasEverHeardVisitor }),
    [buildInstructions, hasEverHeardVisitor],
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
    if (unattended) setConnectionError("setup-agent", true);
  }, [unattended]);

  const onConnectionRestored = useCallback(() => {
    if (unattended) setConnectionError("setup-agent", false);
  }, [unattended]);

  const session = useRealtimeVoiceSession({
    feature: "setup-agent",
    language,
    instructions,
    tools,
    toolHandlers: guardedToolHandlers,
    triggerGreetingOnReady: true,
    pttMic: micUpFront,
    // Web never prompts on connect; the mic arrives later via attachMic().
    deferMic: !micUpFront,
    trackAgentSpeaking: true,
    audioElement,
    audible,
    sessionActive: !muted,
    // Connect straight away and hold the greeting instead: the handshake is
    // then already done when the visitor first interacts.
    autoConnect: autoStart,
    unattended,
    retryPolicy: getRealtimeRetryPolicy(unattended),
    onFatalError: (e) => setUnrecoverableError({ message: e.message, source: e.source, cause: e.cause }),
    onConnectionLost,
    onConnectionRestored,
    onExhausted: () => setMuted(true),
  });

  const isReady = session.connectionState === "ready";

  // Museum: the mic is already attached, so opening it is only a track toggle.
  useEffect(() => {
    if (!micUpFront || muted) return;
    session.setMicEnabled(micOpen);
  }, [micUpFront, micOpen, muted, session.setMicEnabled]);

  /**
   * Web: acquire on the first ask, then keep it. Re-acquiring per press would
   * clip the start of every utterance, so the track stays attached and only its
   * `enabled` flag follows the gesture. Nothing releases it deliberately — the
   * browser's recording indicator goes out when the session itself is torn down
   * (mute, meeting start, unmount), which `close()` already handles.
   *
   * `session.micStream` cannot answer "is it attached?" — `setMicEnabled(false)`
   * nulls it so the visualiser stops — so attachment is tracked here, and reset
   * whenever the session drops, since a reconnect brings a fresh peer connection.
   */
  const micAttachedRef = useRef(false);

  useEffect(() => {
    if (!isReady) micAttachedRef.current = false;
  }, [isReady]);

  /**
   * Every route to an open mic is a gesture the visitor just made — space, a
   * tap, or the on-screen button — so it counts as their own request. Only a
   * reconnect re-opens the mic on its own, and that leaves `micOpen` unchanged
   * so this does not fire. Declared before the attach effect on purpose —
   * effects run in order, and the attach reads this ref synchronously.
   */
  useEffect(() => {
    if (!micOpen) return;
    micRequestedByUserRef.current = true;
  }, [micOpen]);

  useEffect(() => {
    if (micUpFront || !isReady) return;

    if (micAttachedRef.current) {
      session.setMicEnabled(micOpen);
      return;
    }
    if (!micOpen) return;

    let cancelled = false;
    void (async () => {
      // A fresh ask explains a refusal with the blocked overlay; an automatic
      // re-attach after a reconnect stays quiet.
      const attached = await session.attachMic({
        userInitiated: micRequestedByUserRef.current,
      });
      micRequestedByUserRef.current = false;
      if (cancelled) return;
      micAttachedRef.current = attached;
    })();

    return () => {
      cancelled = true;
    };
  }, [micUpFront, micOpen, isReady, session.attachMic, session.setMicEnabled]);

  /**
   * Tell the agent once, when the visitor first becomes audible. Skipped on the
   * first pass after each connect: a session that opened already knowing them
   * was built with instructions that say so.
   */
  const heardAtConnectRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isReady) {
      heardAtConnectRef.current = null;
      return;
    }
    if (heardAtConnectRef.current === null) {
      heardAtConnectRef.current = hasEverHeardVisitor;
      return;
    }
    if (heardAtConnectRef.current || !hasEverHeardVisitor) return;
    heardAtConnectRef.current = true;

    // No response requested — see the message constant.
    session.sendUserMessage(VISITOR_AUDIBLE_MESSAGE);
  }, [isReady, hasEverHeardVisitor, session.sendUserMessage]);

  const start = useCallback(async () => {
    setMuted(false);
  }, []);

  const stop = useCallback(() => {
    micRequestedByUserRef.current = false;
    setMuted(true);
  }, []);

  return {
    // Ready-but-silent still counts as connecting, same as the handshake
    // itself — so a visitor watching for the agent to speak sees one
    // continuous spinner instead of it settling early on nothing. But that
    // only holds while the greeting is actually coming: unaudible, it is
    // held indefinitely (see `audible` above), and waiting for audio that
    // is not coming would spin forever right when the mic button is what
    // lets the visitor supply the gesture that unblocks it.
    isConnecting:
      session.connectionState === "connecting" ||
      (session.connectionState === "ready" && !session.hasReceivedAudioPart && audible),
    isReady,
    hasEverHeardVisitor,
    lastCaption: session.lastCaption,
    lastUserTranscript: session.lastUserTranscript,
    micStream: session.micStream,
    muted,
    setMuted,
    start,
    stop,
    agentSpeaking: session.agentSpeaking,
    sendUserMessage: session.sendUserMessage,
    requestAgentResponse: session.requestAgentResponse,
    interruptAndRespond: session.interruptAndRespond,
  };
}
