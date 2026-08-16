import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireMicrophone,
  classifyRealtimeError,
  computeRealtimeRetryDelay,
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  MicrophoneUnavailableError,
  type MicrophoneErrorReason,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import { requestMicrophone } from "@realtime/micAvailabilityStore";
import type { ConfigureSessionOptions } from "@realtime/realtimeEventLoop";
import { createEventLoop } from "@realtime/realtimeEventLoop";
import {
  mergeRealtimeSessionWithClientConfig,
  type RealtimeSessionConfig,
  type RealtimeSessionServerDefaults,
} from "@realtime/realtimeProtocol";
import type { RealtimeTool, ToolHandler } from "@realtime/realtimeTools";
import { createRemoteAudioAnchor, type RemoteAudioAnchor } from "@realtime/remoteAudioAnchor";
import {
  computeInworldAgentSpeaking,
  createInworldSubtitleTrack,
  findActiveSentenceAtTime,
  type InworldSubtitleTrack,
  type InworldWordToken,
} from "@realtime/inworldSubtitleTrack";
import { log, summarizeLogPayload } from "@/logger";

function realtimeDebugLog(...args: unknown[]): void {
  const message = args.map((arg) => {
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ");
  log.event("REALTIME", message, args.length > 1 ? summarizeLogPayload({ detail: args.slice(1) }) : undefined);
}

export type RealtimeVoiceFeature = "meta-agent" | "setup-agent";

export type RealtimeVoiceSessionConnectionState = "idle" | "connecting" | "ready" | "error";

/**
 * Safety margin subtracted from the client's estimated response duration
 * before using it as an `audio_end_ms` cap for `conversation.item.truncate`.
 * The client's word-alignment-derived duration and the provider's own
 * authoritative audio duration are independent measurements and can differ
 * by a few ms — without this margin, capping exactly at the estimate can
 * still exceed the real duration and get the truncate request rejected.
 */
const AUDIO_END_SAFETY_MARGIN_SEC = 0.15;

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export type RealtimeRetryPolicy = {
  /** Maximum number of retry attempts. Use `Infinity` for indefinite retries (museum). */
  maxRetries: number;
  /**
   * When true and attempts are exhausted, return to `"idle"` state instead of
   * `"error"` — the agent is a bonus feature and the app continues normally.
   */
  giveUpSilently: boolean;
};

/**
 * Returns the appropriate retry policy for the agent's criticality.
 * - Critical (museum): infinite retries, never give up silently.
 * - Non-critical (web): 3 retries, then silently return to idle.
 */
export function getRealtimeRetryPolicy(critical: boolean): RealtimeRetryPolicy {
  return critical
    ? { maxRetries: Infinity, giveUpSilently: false }
    : { maxRetries: 3, giveUpSilently: true };
}

// Per-feature fatal message strings (internal — not part of the public API).
const FEATURE_MESSAGES: Record<
  RealtimeVoiceFeature,
  { defaultsNotLoaded: string; startFailed: string; connectionLost: string }
> = {
  "setup-agent": {
    defaultsNotLoaded: "Setup agent defaults not loaded",
    startFailed: "Setup agent failed to start",
    connectionLost: "Setup agent connection lost",
  },
  "meta-agent": {
    defaultsNotLoaded: "Meta-agent defaults not loaded",
    startFailed: "Meta-agent failed to start",
    connectionLost: "Meta-agent connection lost",
  },
};

export type UseRealtimeVoiceSessionParams = {
  feature: RealtimeVoiceFeature;
  language: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  /** Send opening greeting after `session.updated` (setup agent). Meta-agent passes false. */
  triggerGreetingOnReady: boolean;
  /** Bearer auth for bootstrap + call (meta-agent live key). */
  authHeaders?: Record<string, string>;
  /** Push-to-talk: mic track starts disabled; open via `setMicEnabled`. */
  pttMic?: boolean;
  /**
   * Connect without a microphone, so the session never triggers a permission
   * prompt on its own. The agent can speak immediately; the visitor hands over
   * their mic later with {@link UseRealtimeVoiceSessionResult.attachMic}.
   */
  deferMic?: boolean;
  /** Expose `agentSpeaking` while agent audio is playing (Inworld: subtitle clock; else: response lifecycle). */
  trackAgentSpeaking?: boolean;
  /** Setup-agent: optional remote audio sink (created on body if absent). */
  audioElement?: HTMLAudioElement | null;
  /** When false, tear down WebRTC (setup-agent muted). Default true. */
  sessionActive?: boolean;
  /** Connect when `sessionActive` (setup-agent `autoStart`). Default true. */
  autoConnect?: boolean;
  /** Fired after the provider acks `session.updated` (safe point for activation). */
  onSessionReady?: () => void;
  /**
   * Whether to treat this agent as museum-mode (affects mic permission classification
   * and is used by policy helpers via `getRealtimeRetryPolicy`).
   */
  isMuseumMode?: boolean;
  /** Retry behaviour. Omit to disable automatic retries (error state only). */
  retryPolicy?: RealtimeRetryPolicy;
  /** Called when a fatal, non-recoverable error occurs. Goes through the main error pipeline. */
  onFatalError?: (e: { message: string; source: string; cause?: unknown }) => void;
  /**
   * Called when the microphone can't be used but the app is fine without it
   * (web). Not an error path: no retry, no overlay, no client report — the
   * caller decides whether to say anything.
   */
  onUnavailable?: (e: { reason: MicrophoneErrorReason; message: string }) => void;
  /** Called on the first retryable failure (connection is now down). */
  onConnectionLost?: () => void;
  /** Called when connection is re-established after having been lost. */
  onConnectionRestored?: () => void;
  /**
   * Called when retries are exhausted and `giveUpSilently` is true (web mode).
   * Lets the caller return to a clean idle state so the user can manually retry.
   */
  onExhausted?: () => void;
};

export type UseRealtimeVoiceSessionResult = {
  connectionState: RealtimeVoiceSessionConnectionState;
  /** @deprecated Use `onFatalError` callback instead. Will be removed. */
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  hasReceivedAudioPart: boolean;
  agentSpeaking: boolean;
  micStream: MediaStream | null;
  setMicEnabled: (open: boolean) => void;
  /**
   * Ask for the microphone and start sending it on the live session (no
   * reconnect). Resolves `false` when the mic couldn't be obtained — the
   * session keeps running, listening-only.
   *
   * Pass `userInitiated` when this came from the visitor pressing something, so
   * a failure is explained rather than swallowed.
   */
  attachMic: (options?: { userInitiated?: boolean }) => Promise<boolean>;
  /** Stop sending audio and release the microphone. */
  detachMic: () => void;
  sendUserMessage: (text: string) => void;
  /** Ask the model to respond when no response is in flight. */
  requestAgentResponse: () => void;
  /** Barge-in: cancel/clear any in-flight response audio, then send a message and respond. */
  interruptAndRespond: (text: string, reason?: string) => void;
  setAgentOutputMuted: (muted: boolean) => void;
  /** Push updated instructions/tools on the live data channel. */
  reconfigureSession: (options?: ConfigureSessionOptions) => void;
};

function attachRemoteAudio(
  track: MediaStreamTrack,
  audioElement: HTMLAudioElement | null,
): HTMLAudioElement {
  const el = audioElement ?? document.createElement("audio");
  el.autoplay = true;
  el.setAttribute("playsinline", "true");
  el.muted = false;
  el.volume = 1.0;
  el.srcObject = new MediaStream([track]);
  el.style.display = "none";
  if (!audioElement) {
    document.body.appendChild(el);
  }
  // A rejected play() means the browser's autoplay policy blocked us — the
  // session is live and billing, but the visitor hears nothing, which is
  // indistinguishable from a working agent that has gone quiet. Never swallow it.
  void el.play().catch((err: unknown) => {
    log.event("ERROR", "realtime remote audio blocked by autoplay policy", {
      name: err instanceof Error ? err.name : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  });
  return el;
}

function setMicTracksEnabled(stream: MediaStream | null | undefined, open: boolean): void {
  stream?.getAudioTracks().forEach((t) => { t.enabled = open; });
}

/**
 * Shared WebRTC + caption + event-loop glue for realtime voice features.
 */
export function useRealtimeVoiceSession(
  params: UseRealtimeVoiceSessionParams,
): UseRealtimeVoiceSessionResult {
  const {
    feature,
    language,
    instructions,
    tools,
    toolHandlers,
    triggerGreetingOnReady,
    authHeaders,
    pttMic = false,
    deferMic = false,
    trackAgentSpeaking = false,
    audioElement,
    sessionActive = true,
    autoConnect = true,
    onSessionReady,
    isMuseumMode = false,
    retryPolicy,
    onFatalError,
    onUnavailable,
    onConnectionLost,
    onConnectionRestored,
    onExhausted,
  } = params;

  const authHeadersKey = authHeaders ? JSON.stringify(authHeaders) : "";

  const [connectionState, setConnectionState] =
    useState<RealtimeVoiceSessionConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [lastUserTranscript, setLastUserTranscript] = useState<string | null>(null);
  const [hasReceivedAudioPart, setHasReceivedAudioPart] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const audioElementRef = useRef(audioElement);
  const serverDefaultsRef = useRef<RealtimeSessionServerDefaults | null>(null);
  const eventLoopRef = useRef<ReturnType<typeof createEventLoop> | null>(null);
  const subtitleTrackRef = useRef<InworldSubtitleTrack | null>(null);
  /** AudioContext.currentTime recorded when the first audible onset of a response is detected. */
  const responseAudioAnchorCtxSecRef = useRef<number | null>(null);
  /**
   * True between `response.created` and the confirmed-silence reset. While
   * pending, the anchor and subtitle track still describe the *previous*
   * response, so any playback offset derived from them is untrustworthy.
   */
  const responseTransitionPendingRef = useRef(false);
  /** Fallback timer that force-resets if confirmed silence never arrives. */
  const pendingResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alignmentRafRef = useRef<number | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioAnchorRef = useRef<RemoteAudioAnchor | null>(null);
  const userTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Retry state
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptsRef = useRef(0);
  /** True once onConnectionLost has been called and onConnectionRestored not yet. */
  const hasNotifiedLostRef = useRef(false);

  const handlersRef = useRef(toolHandlers);
  const instructionsRef = useRef(instructions);
  const toolsRef = useRef(tools);
  const onSessionReadyRef = useRef(onSessionReady);
  const retryPolicyRef = useRef(retryPolicy);
  const onFatalErrorRef = useRef(onFatalError);
  const onUnavailableRef = useRef(onUnavailable);
  const onConnectionLostRef = useRef(onConnectionLost);
  const onConnectionRestoredRef = useRef(onConnectionRestored);
  const onExhaustedRef = useRef(onExhausted);
  const isMuseumModeRef = useRef(isMuseumMode);
  useEffect(() => {
    handlersRef.current = toolHandlers;
    instructionsRef.current = instructions;
    toolsRef.current = tools;
    onSessionReadyRef.current = onSessionReady;
    retryPolicyRef.current = retryPolicy;
    onFatalErrorRef.current = onFatalError;
    onUnavailableRef.current = onUnavailable;
    onConnectionLostRef.current = onConnectionLost;
    onConnectionRestoredRef.current = onConnectionRestored;
    onExhaustedRef.current = onExhausted;
    isMuseumModeRef.current = isMuseumMode;
  });

  useEffect(() => {
    audioElementRef.current = audioElement;
  }, [audioElement]);

  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // startRef lets the retry timer call the latest start() without a dep cycle.
  const startRef = useRef<() => void>(() => {});

  const buildSessionConfig = useCallback((): RealtimeSessionConfig => {
    const defaults = serverDefaultsRef.current;
    if (!defaults) throw new Error(FEATURE_MESSAGES[feature].defaultsNotLoaded);
    return mergeRealtimeSessionWithClientConfig(
      defaults,
      instructionsRef.current,
      toolsRef.current,
    );
  }, [feature]);

  const resetSessionUiState = useCallback(() => {
    setError(null);
    setLastCaption(null);
    setLastUserTranscript(null);
    setHasReceivedAudioPart(false);
    setAgentSpeaking(false);
    setMicStream(null);
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    attemptRef.current += 1;
    serverDefaultsRef.current = null;
    // Cancel any pending retry timer
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (userTranscriptTimerRef.current) {
      clearTimeout(userTranscriptTimerRef.current);
      userTranscriptTimerRef.current = null;
    }
    if (pendingResetTimeoutRef.current != null) {
      clearTimeout(pendingResetTimeoutRef.current);
      pendingResetTimeoutRef.current = null;
    }
    if (alignmentRafRef.current != null) {
      cancelAnimationFrame(alignmentRafRef.current);
      alignmentRafRef.current = null;
    }
    subtitleTrackRef.current = null;
    responseAudioAnchorCtxSecRef.current = null;
    responseTransitionPendingRef.current = false;
    eventLoopRef.current = null;
    remoteAudioAnchorRef.current?.dispose();
    remoteAudioAnchorRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    const ownedAudio = remoteAudioRef.current;
    if (ownedAudio && ownedAudio !== audioElementRef.current) {
      try {
        ownedAudio.srcObject = null;
        ownedAudio.remove();
      } catch { /* ignore */ }
    }
    remoteAudioRef.current = null;
    setMicStream(null);
  }, []);

  /**
   * Schedule a retry attempt with jittered exponential backoff.
   * Notifies onConnectionLost on the first failure, tracks exhaustion.
   */
  const scheduleRetry = useCallback((resetAttempts = false) => {
    if (resetAttempts) retryAttemptsRef.current = 0;

    const attempt = retryAttemptsRef.current++;
    const policy = retryPolicyRef.current;

    // Notify once that the connection is down.
    if (!hasNotifiedLostRef.current) {
      hasNotifiedLostRef.current = true;
      onConnectionLostRef.current?.();
    }

    // Without a policy, fall through to error state.
    if (!policy || (policy.maxRetries !== Infinity && attempt >= policy.maxRetries)) {
      log.event("REALTIME", "retry exhausted", { feature, attempt });
      if (policy?.giveUpSilently) {
        setConnectionState("idle");
        onExhaustedRef.current?.();
      } else {
        setConnectionState("error");
      }
      return;
    }

    const delay = computeRealtimeRetryDelay(attempt);
    log.event("REALTIME", "retry scheduled", { feature, attempt, delayMs: Math.round(delay) });

    // Keep spinning while retrying.
    setConnectionState("connecting");
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      startRef.current();
    }, delay);
  }, [feature]);

  const start = useCallback(async () => {
    if (connectionRef.current || abortRef.current) return;

    const myAttempt = ++attemptRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => myAttempt !== attemptRef.current;

    resetSessionUiState();
    setConnectionState("connecting");
    setError(null);
    setHasReceivedAudioPart(false);
    log.event("REALTIME", "connecting", { feature, language });

    let conn: RealtimeConnection | null = null;
    try {
      // Start bootstrap and mic acquisition in parallel for minimum latency in
      // the success path. But await mic first: a mic failure is always fatal and
      // resolved instantly by the browser — there is no reason to block on the
      // bootstrap network round-trip (up to 15 s) before surfacing the error.
      const bootstrapPromise = fetchRealtimeBootstrap(
        { feature, language },
        realtimeDebugLog,
        controller.signal,
        authHeaders,
      );
      // Unconditionally mark as observed so an abort/reject here (e.g. unmounting while
      // mic acquisition is still pending) never surfaces as an unhandled rejection,
      // regardless of which branch below ends up abandoning it. The `await bootstrapPromise`
      // further down still fires normally and handles the real error on that path.
      bootstrapPromise.catch(() => {});

      // Deferred-mic sessions never call getUserMedia here, so they never
      // prompt: an empty audio sender is negotiated and the visitor can hand
      // over their mic later via attachMic().
      const micStreamValue: MediaStream | null = deferMic ? null : await acquireMicrophone();

      if (isStale()) {
        micStreamValue?.getTracks().forEach((t) => t.stop());
        return;
      }

      let bootstrapValue: Awaited<typeof bootstrapPromise>;
      try {
        bootstrapValue = await bootstrapPromise;
      } catch (bootErr) {
        micStreamValue?.getTracks().forEach((t) => t.stop());
        throw bootErr;
      }

      if (isStale()) {
        micStreamValue?.getTracks().forEach((t) => t.stop());
        return;
      }

      const { provider, session: defaults, iceServers } = bootstrapValue;
      if (micStreamValue) setMicTracksEnabled(micStreamValue, !pttMic);

      serverDefaultsRef.current = defaults;

      const subtitleTrack = createInworldSubtitleTrack({
        onSentenceFlushed: (s, total) => {
          realtimeDebugLog(`[SUBS] SENTENCE ${total - 1} start=${s.start.toFixed(3)} end=${s.end.toFixed(3)} text="${s.text.slice(0, 60)}"`);
        },
      });
      subtitleTrackRef.current = subtitleTrack;
      responseAudioAnchorCtxSecRef.current = null;

      const usePlaybackSpeaking = trackAgentSpeaking;
      let lastAgentSpeaking = false;
      let responseCancelled = false;

      // Response-transition reset. `response.created` does not mean the
      // previous response's audio has stopped — after an interrupt it can keep
      // draining for a second or two — so resetting captions instantly would
      // hide a caption you can still hear. The reset runs on whichever signal
      // is trustworthy: the playback clock when it says the audio finished
      // (exact), otherwise the anchor's RMS silence detector (approximate, but
      // the only thing that notices audio cut short mid-stream).
      let pendingWordAlignmentChunks: Array<{
        contentIndex: number;
        words: ReadonlyArray<InworldWordToken>;
      }> = [];
      const PENDING_RESET_TIMEOUT_MS = 8000;

      /**
       * Whether the previous response's audio has certainly finished playing,
       * per the word-alignment playback clock. False means "may still be
       * draining" — including the unknown cases, so we err toward deferring.
       */
      const isPreviousResponseAudioFinished = (): boolean => {
        const anchor = remoteAudioAnchorRef.current;
        const anchorCtxSec = responseAudioAnchorCtxSecRef.current;
        // Nothing anchored yet → nothing is playing.
        if (anchor == null || anchorCtxSec == null) return true;
        const endSec = subtitleTrack.getPlaybackEndSec();
        // Anchored but no alignment data → the response produced no audio.
        if (endSec == null) return true;
        return anchor.getCtxTime() - anchorCtxSec >= endSec;
      };

      const performResponseTransitionReset = (reason: string) => {
        if (pendingResetTimeoutRef.current != null) {
          clearTimeout(pendingResetTimeoutRef.current);
          pendingResetTimeoutRef.current = null;
        }
        if (!responseTransitionPendingRef.current) return;
        responseTransitionPendingRef.current = false;
        // A stale closure's fallback timeout could otherwise fire after a
        // reconnect and clobber a newer connection's already-live anchor.
        if (isStale()) return;

        responseCancelled = false;
        if (usePlaybackSpeaking) {
          lastAgentSpeaking = false;
          setAgentSpeaking(false);
        }
        subtitleTrack.reset();
        responseAudioAnchorCtxSecRef.current = null;
        setLastCaption(null);
        realtimeDebugLog(`[SUBS] RESET (${reason}) ctxTime=${remoteAudioAnchorRef.current?.getCtxTime().toFixed(3) ?? "n/a"}`);

        if (pendingWordAlignmentChunks.length > 0) {
          const buffered = pendingWordAlignmentChunks;
          pendingWordAlignmentChunks = [];
          for (const chunk of buffered) {
            subtitleTrack.applyChunk(chunk.contentIndex, chunk.words);
          }
        }
      };

      // RAF loop: drive caption from alignment + AudioContext clock.
      let lastDisplayedText: string | null | undefined = undefined;
      let lastTickLogMs = 0;
      const tickAlignment = () => {
        if (!isStale()) {
          const anchor = remoteAudioAnchorRef.current;
          const anchorCtxSec = responseAudioAnchorCtxSecRef.current;
          const nowMs = performance.now();
          if (nowMs - lastTickLogMs >= 1000) {
            lastTickLogMs = nowMs;
            const sentences = subtitleTrack.getSentences();
            const playbackSec = anchor != null && anchorCtxSec != null
              ? anchor.getCtxTime() - anchorCtxSec
              : null;
            realtimeDebugLog(`[SUBS] TICK anchor=${anchor != null ? "ok" : "null"} anchorCtxSec=${anchorCtxSec != null ? anchorCtxSec.toFixed(3) : "null"} sentences=${sentences.length} playbackSec=${playbackSec != null ? playbackSec.toFixed(3) : "null"} ctxTime=${anchor?.getCtxTime().toFixed(3) ?? "n/a"}`);
          }
          if (anchor != null && anchorCtxSec != null) {
            const sentences = subtitleTrack.getSentences();
            const playbackSec = anchor.getCtxTime() - anchorCtxSec;
            const active = findActiveSentenceAtTime(sentences, playbackSec);
            const pendingText = subtitleTrack.isPendingComplete()
              ? subtitleTrack.getPendingText()
              : null;
            const text = active?.text ?? pendingText ?? null;
            if (text !== lastDisplayedText) {
              lastDisplayedText = text;
              setLastCaption(text);
              realtimeDebugLog(`[SUBS] DISPLAY ${text ? `"${text.slice(0, 60)}"` : "null"} playbackSec=${playbackSec.toFixed(3)} ctxTime=${anchor.getCtxTime().toFixed(3)}`);
            }

            if (usePlaybackSpeaking) {
              const endSec = subtitleTrack.getPlaybackEndSec();
              const shouldSpeak = computeInworldAgentSpeaking({
                anchorSet: true,
                playbackSec,
                endSec,
                responseCancelled,
              });
              if (shouldSpeak !== lastAgentSpeaking) {
                lastAgentSpeaking = shouldSpeak;
                setAgentSpeaking(shouldSpeak);
                realtimeDebugLog(`[SUBS] SPEAKING ${shouldSpeak} playbackSec=${playbackSec.toFixed(3)} endSec=${endSec?.toFixed(3) ?? "null"}`);
              }
            }
          }
        }
        alignmentRafRef.current = requestAnimationFrame(tickAlignment);
      };
      alignmentRafRef.current = requestAnimationFrame(tickAlignment);

      let activeConn: RealtimeConnection | null = null;
      const sendOnDc = (payload: unknown) => {
        const dc = activeConn?.dc ?? connectionRef.current?.dc;
        if (!dc || dc.readyState !== "open") return;
        dc.send(JSON.stringify(payload));
      };

      const loop = createEventLoop({
        send: sendOnDc,
        getCtx: () => ({ toolHandlers: handlersRef.current }),
        callbacks: {
          onCaption: (text) => {
            if (!isStale()) setLastCaption(text);
          },
          onUserTranscript: (text) => {
            if (isStale()) return;
            setLastUserTranscript(text);
            if (userTranscriptTimerRef.current) {
              clearTimeout(userTranscriptTimerRef.current);
            }
            userTranscriptTimerRef.current = setTimeout(() => {
              if (!isStale()) setLastUserTranscript(null);
              userTranscriptTimerRef.current = null;
            }, 3000);
          },
          onError: (message) => {
            if (isStale()) return;
            log.event("ERROR", "realtime provider error", { feature, message });
            cleanup();
            scheduleRetry();
          },
          onSessionReady: () => {
            if (!isStale()) onSessionReadyRef.current?.();
          },
          onWordAlignment: (contentIndex, words) => {
            if (isStale()) return;
            // Alignment data for the next response can arrive before we know
            // the previous response's audio has actually gone silent — buffer
            // it rather than applying to the still-displayed old track.
            if (responseTransitionPendingRef.current) {
              pendingWordAlignmentChunks.push({ contentIndex, words });
              return;
            }
            subtitleTrack.applyChunk(contentIndex, words);
          },
          onResponseStarted: () => {
            const anchor = remoteAudioAnchorRef.current;
            responseTransitionPendingRef.current = true;
            pendingWordAlignmentChunks = [];

            // A cancelled response (voice or click interrupt) stops emitting
            // alignment data at the cut, so the playback clock under-reports
            // its duration and can claim the audio finished while it is still
            // draining. Never trust the clock in that case.
            if (!responseCancelled && isPreviousResponseAudioFinished()) {
              // Exact path (normal turns): the previous audio has played out,
              // so reset now. Arm without waiting for a silence window too —
              // there is no stale audio to false-trigger on, and waiting could
              // miss an onset that follows closely.
              performResponseTransitionReset("playback-complete");
              anchor?.arm(false);
              return;
            }

            // Approximate path (interrupts, back-to-back responses): audio may
            // still be draining, so keep the current caption and wait for the
            // detector to confirm real silence — or a fallback timeout, in
            // case it never does.
            anchor?.arm(true);
            if (pendingResetTimeoutRef.current != null) clearTimeout(pendingResetTimeoutRef.current);
            pendingResetTimeoutRef.current = setTimeout(() => {
              pendingResetTimeoutRef.current = null;
              performResponseTransitionReset("timeout-fallback");
            }, PENDING_RESET_TIMEOUT_MS);
            realtimeDebugLog("[SUBS] response.created — audio may still be draining, waiting for confirmed silence");
          },
          onResponseDone: (info) => {
            const cancelled = info?.status === "cancelled" || info?.status === "failed";
            // Transition state, not display state: this decides whether the
            // next transition may trust the playback clock, so it is tracked
            // even when `agentSpeaking` is not exposed.
            if (cancelled && !isStale()) responseCancelled = true;

            // Either way the agent has stopped: cancelled mid-stream, or it
            // produced no audio for the clock to run against.
            if (usePlaybackSpeaking && !isStale()) {
              if (cancelled || subtitleTrack.getPlaybackEndSec() == null) {
                lastAgentSpeaking = false;
                setAgentSpeaking(false);
              }
            }
            if (responseAudioAnchorCtxSecRef.current == null) {
              realtimeDebugLog("[SUBS] WARN: response.done but anchor was never set — no captions shown");
            }
          },
          onAudioPartReady: () => {
            if (!isStale()) setHasReceivedAudioPart(true);
          },
          log: realtimeDebugLog,
        },
      });
      eventLoopRef.current = loop;

      conn = await createRealtimeConnection({
        session: defaults,
        iceServers,
        callPath: "/api/realtime/call",
        callHeaders: authHeaders
          ? { "Content-Type": "application/json", ...authHeaders }
          : undefined,
        callBodyExtras: { feature, provider, language },
        micStream: micStreamValue ?? undefined,
        deferMic,
        log: realtimeDebugLog,
        signal: controller.signal,
        onRemoteTrack: (track) => {
          if (isStale()) { try { track.stop(); } catch { /* ignore */ } return; }
          const el = attachRemoteAudio(track, audioElementRef.current ?? null);
          remoteAudioRef.current = el;
          try {
            remoteAudioAnchorRef.current?.dispose();
            remoteAudioAnchorRef.current = createRemoteAudioAnchor({
              track,
              onAudioStart: (_nowMs, ctxTime) => {
                if (isStale()) return;
                if (responseAudioAnchorCtxSecRef.current == null) {
                  responseAudioAnchorCtxSecRef.current = ctxTime;
                  realtimeDebugLog(`[SUBS] ANCHOR set: anchorCtxSec=${ctxTime.toFixed(3)}`);
                }
              },
              onArmed: () => {
                if (isStale()) return;
                performResponseTransitionReset("silence-confirmed");
              },
              log: realtimeDebugLog,
            });
          } catch { /* remote audio anchor optional */ }
          track.onended = () => {
            remoteAudioAnchorRef.current?.dispose();
            remoteAudioAnchorRef.current = null;
          };
        },
        onEvent: (event) => {
          if (isStale()) return;
          // Never let a throw inside the loop become an invisible unhandled
          // rejection — on an unattended kiosk a silent handler crash is
          // indistinguishable from the agent simply going quiet.
          void loop.handleEvent(event).catch((err) => {
            log.event("ERROR", "realtime event handling threw", {
              feature,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        },
        onOpen: () => {
          if (isStale()) return;
          loop.configureSession(buildSessionConfig(), { triggerGreetingOnReady });
        },
        onClose: (reason) => {
          if (isStale()) return;
          log.event("REALTIME", "connection closed", { feature, reason });
          if (reason === "pc_failed" || reason === "dc_error") {
            log.event("ERROR", "realtime connection lost", { feature, reason });
            // Mid-session drop: reset attempt counter (was connected successfully)
            // then tear down and retry.
            cleanup();
            scheduleRetry(true);
          }
        },
      });

      if (isStale()) {
        conn.close();
        return;
      }

      activeConn = conn;
      connectionRef.current = conn;
      log.event("REALTIME", "ready", { feature, provider });

      // Successful connection — notify restoration if previously lost.
      if (hasNotifiedLostRef.current) {
        hasNotifiedLostRef.current = false;
        onConnectionRestoredRef.current?.();
      }
      retryAttemptsRef.current = 0;

      setConnectionState("ready");
    } catch (e) {
      // Only *our* controller firing means "we cancelled this, drop it". A
      // network timeout also surfaces as an AbortError from fetch, and treating
      // that as a cancellation used to strand the session in "connecting"
      // forever — the exact case of a visitor sitting on the mic prompt.
      const isOwnAbort =
        controller.signal.aborted && e instanceof Error && e.name === "AbortError";
      if (isOwnAbort || isStale()) {
        conn?.close();
        return;
      }

      conn?.close();

      const kind = classifyRealtimeError(e, { isMuseumMode: isMuseumModeRef.current });
      const msg = e instanceof Error ? e.message : FEATURE_MESSAGES[feature].startFailed;
      log.event("ERROR", "realtime session start failed", { feature, kind, message: msg });

      if (kind === "fatal") {
        setError(msg);
        setConnectionState("error");
        onFatalErrorRef.current?.({ message: msg, source: `realtime.${feature}`, cause: e });
      } else if (kind === "unavailable") {
        // The agent can't run, but the app is fine — go quiet, don't retry.
        setConnectionState("idle");
        onUnavailableRef.current?.({
          reason: e instanceof MicrophoneUnavailableError ? e.reason : "unknown",
          message: msg,
        });
      } else {
        scheduleRetry();
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [
    feature,
    language,
    authHeadersKey,
    pttMic,
    deferMic,
    trackAgentSpeaking,
    buildSessionConfig,
    triggerGreetingOnReady,
    authHeaders,
    resetSessionUiState,
    cleanup,
    scheduleRetry,
  ]);

  // Keep startRef current so retry timers always call the latest start.
  useEffect(() => {
    startRef.current = () => { void start(); };
  }, [start]);

  useEffect(() => {
    return () => {
      cleanup();
      setConnectionState("idle");
    };
  }, [cleanup]);

  useEffect(() => {
    if (!sessionActive) {
      cleanup();
      setConnectionState("idle");
      resetSessionUiState();
      // Reset retry budget so the next manual start gets a full retry cycle.
      retryAttemptsRef.current = 0;
      hasNotifiedLostRef.current = false;
      return;
    }
    if (!autoConnect) return;
    void start();
    return () => {
      cleanup();
      resetSessionUiState();
      setConnectionState("idle");
    };
  }, [sessionActive, autoConnect, start, cleanup, resetSessionUiState]);

  const setMicEnabled = useCallback((open: boolean) => {
    const stream = connectionRef.current?.micStream ?? null;
    setMicTracksEnabled(stream, open);
    setMicStream(open ? stream : null);
  }, []);

  const attachMic = useCallback(async (
    { userInitiated = false }: { userInitiated?: boolean } = {},
  ): Promise<boolean> => {
    const conn = connectionRef.current;
    if (!conn) return false;
    if (conn.micStream) return true;

    try {
      const stream = await requestMicrophone({ userInitiated });
      // The session can be torn down while the permission prompt is open.
      if (connectionRef.current !== conn) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      await conn.attachMic(stream);
      setMicStream(stream);
      log.event("REALTIME", "mic attached", { feature });
      return true;
    } catch (e) {
      const kind = classifyRealtimeError(e, { isMuseumMode: isMuseumModeRef.current });
      const message = e instanceof Error ? e.message : "The microphone could not be accessed.";
      log.event("ERROR", "mic attach failed", { feature, kind, message });

      if (kind === "unavailable") {
        onUnavailableRef.current?.({
          reason: e instanceof MicrophoneUnavailableError ? e.reason : "unknown",
          message,
        });
      } else {
        onFatalErrorRef.current?.({ message, source: `realtime.${feature}.mic`, cause: e });
      }
      return false;
    }
  }, [feature]);

  const detachMic = useCallback(() => {
    connectionRef.current?.detachMic();
    setMicStream(null);
    log.event("REALTIME", "mic detached", { feature });
  }, [feature]);

  const setAgentOutputMuted = useCallback((muted: boolean) => {
    const el = remoteAudioRef.current;
    if (el) {
      el.muted = muted;
    }
    if (muted) {
      setAgentSpeaking(false);
      setLastCaption(null);
      setLastUserTranscript(null);
      if (userTranscriptTimerRef.current) {
        clearTimeout(userTranscriptTimerRef.current);
        userTranscriptTimerRef.current = null;
      }
      eventLoopRef.current?.cancelActiveResponse();
    }
  }, []);

  const sendUserMessage = useCallback((text: string) => {
    eventLoopRef.current?.sendUserMessage(text);
  }, []);

  const requestAgentResponse = useCallback(() => {
    eventLoopRef.current?.requestResponseIfIdle();
  }, []);

  const interruptAndRespond = useCallback((text: string, reason?: string) => {
    const loop = eventLoopRef.current;
    const responseActive = loop?.isResponseActive() ?? false;

    // How far into the current/last response's audio we actually are, so the
    // event loop can truncate the assistant's transcript to match what was
    // audibly heard rather than what was fully generated. AudioContext.currentTime
    // is a free-running hardware clock — it keeps advancing after playback
    // ends, so this grows without bound once the agent has gone quiet.
    // Between response.created and the confirmed-silence reset, the anchor and
    // subtitle track still describe the *previous* response while the event
    // loop's assistant audio item id has already advanced to the new one — an
    // offset from that timeline would truncate the wrong response at a
    // meaningless point. Treat the timeline as unknown instead; the cancel and
    // output-buffer clear still apply, we just don't claim to know how much
    // was heard.
    const staleTimeline = responseTransitionPendingRef.current;
    const anchor = remoteAudioAnchorRef.current;
    const anchorCtxSec = responseAudioAnchorCtxSecRef.current;
    const rawElapsedSec = !staleTimeline && anchor != null && anchorCtxSec != null
      ? anchor.getCtxTime() - anchorCtxSec
      : null;
    const endSec = staleTimeline
      ? null
      : (subtitleTrackRef.current?.getPlaybackEndSec() ?? null);
    // Our client-side duration estimate can be a few ms ahead of the
    // provider's own authoritative duration (independent measurements),
    // so shave a safety margin off the cap rather than clamp to it exactly.
    const safeEndSec = endSec != null ? Math.max(0, endSec - AUDIO_END_SAFETY_MARGIN_SEC) : null;

    const audioAlreadyFinished =
      !responseActive && rawElapsedSec != null && safeEndSec != null && rawElapsedSec >= safeEndSec;

    if (audioAlreadyFinished) {
      // Nothing to interrupt: the previous response's audio has already
      // finished playing, so just react normally instead of sending a
      // cancel/truncate/clear that has no target and risks an out-of-range
      // audio_end_ms right at the tail end of playback (observed crash).
      loop?.sendUserMessage(text);
      loop?.requestResponseIfIdle();
      return;
    }

    const clampedSec = safeEndSec != null && rawElapsedSec != null
      ? Math.min(rawElapsedSec, safeEndSec)
      : rawElapsedSec;
    const audioElapsedMs = clampedSec != null ? Math.max(0, clampedSec * 1000) : undefined;
    loop?.interruptAndRespond(text, { reason, audioElapsedMs });
  }, []);

  const reconfigureSession = useCallback((options?: ConfigureSessionOptions) => {
    const loop = eventLoopRef.current;
    if (!loop) return;
    loop.configureSession(buildSessionConfig(), options);
  }, [buildSessionConfig]);

  return {
    connectionState,
    error,
    lastCaption,
    lastUserTranscript,
    hasReceivedAudioPart,
    agentSpeaking,
    micStream,
    setMicEnabled,
    attachMic,
    detachMic,
    sendUserMessage,
    requestAgentResponse,
    interruptAndRespond,
    setAgentOutputMuted,
    reconfigureSession,
  };
}
