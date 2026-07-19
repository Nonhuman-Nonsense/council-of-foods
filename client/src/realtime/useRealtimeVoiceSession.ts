import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireMicrophone,
  classifyRealtimeError,
  computeRealtimeRetryDelay,
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import type { ConfigureSessionOptions } from "@voice/realtimeEventLoop";
import { createEventLoop } from "@voice/realtimeEventLoop";
import {
  mergeRealtimeSessionWithClientConfig,
  type RealtimeSessionConfig,
  type RealtimeSessionServerDefaults,
} from "@realtime/realtimeProtocol";
import type { RealtimeTool, ToolHandler } from "@voice/guideTools";
import { createCaptionScheduler } from "@voice/captionScheduler";
import { createRemoteAudioAnchor, type RemoteAudioAnchor } from "@voice/remoteAudioAnchor";
import {
  computeInworldAgentSpeaking,
  createInworldSubtitleTrack,
  findActiveSentenceAtTime,
  type InworldSubtitleTrack,
} from "@voice/inworldSubtitleTrack";
import { log, summarizeLogPayload } from "@/logger";

const AUDIO_ANCHOR_FALLBACK_DELAY_MS = 600;

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

export type RealtimeVoiceFeature = "meta-agent" | "voice-guide";

export type RealtimeVoiceSessionConnectionState = "idle" | "connecting" | "ready" | "error";

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
  "voice-guide": {
    defaultsNotLoaded: "Voice guide defaults not loaded",
    startFailed: "Voice guide failed to start",
    connectionLost: "Voice guide connection lost",
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
  /** Send opening greeting after `session.updated` (voice guide). Meta-agent passes false. */
  triggerGreetingOnReady: boolean;
  /** Bearer auth for bootstrap + call (meta-agent live key). */
  authHeaders?: Record<string, string>;
  /** Push-to-talk: mic track starts disabled; open via `setMicEnabled`. */
  pttMic?: boolean;
  /** Expose `agentSpeaking` while agent audio is playing (Inworld: subtitle clock; else: response lifecycle). */
  trackAgentSpeaking?: boolean;
  /** Voice-guide: optional remote audio sink (created on body if absent). */
  audioElement?: HTMLAudioElement | null;
  /** When false, tear down WebRTC (voice-guide muted). Default true. */
  sessionActive?: boolean;
  /** Connect when `sessionActive` (voice-guide `autoStart`). Default true. */
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
  sendUserMessage: (text: string) => void;
  /** Ask the model to respond when no response is in flight. */
  requestAgentResponse: () => void;
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
  void el.play().catch(() => {});
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
    trackAgentSpeaking = false,
    audioElement,
    sessionActive = true,
    autoConnect = true,
    onSessionReady,
    isMuseumMode = false,
    retryPolicy,
    onFatalError,
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
  const captionSchedulerRef = useRef<ReturnType<typeof createCaptionScheduler> | null>(null);
  const subtitleTrackRef = useRef<InworldSubtitleTrack | null>(null);
  /** AudioContext.currentTime recorded when the first audible onset of a response is detected. */
  const responseAudioAnchorCtxSecRef = useRef<number | null>(null);
  const alignmentRafRef = useRef<number | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioAnchorRef = useRef<RemoteAudioAnchor | null>(null);
  const audioAnchorFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearAudioAnchorFallback = useCallback(() => {
    if (audioAnchorFallbackTimerRef.current != null) {
      clearTimeout(audioAnchorFallbackTimerRef.current);
      audioAnchorFallbackTimerRef.current = null;
    }
  }, []);

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
    clearAudioAnchorFallback();
    if (userTranscriptTimerRef.current) {
      clearTimeout(userTranscriptTimerRef.current);
      userTranscriptTimerRef.current = null;
    }
    if (alignmentRafRef.current != null) {
      cancelAnimationFrame(alignmentRafRef.current);
      alignmentRafRef.current = null;
    }
    captionSchedulerRef.current?.cancel();
    captionSchedulerRef.current = null;
    subtitleTrackRef.current = null;
    responseAudioAnchorCtxSecRef.current = null;
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
  }, [clearAudioAnchorFallback]);

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

      const micStreamValue: MediaStream = await acquireMicrophone();

      if (isStale()) {
        micStreamValue.getTracks().forEach((t) => t.stop());
        return;
      }

      let bootstrapValue: Awaited<typeof bootstrapPromise>;
      try {
        bootstrapValue = await bootstrapPromise;
      } catch (bootErr) {
        micStreamValue.getTracks().forEach((t) => t.stop());
        throw bootErr;
      }

      if (isStale()) {
        micStreamValue.getTracks().forEach((t) => t.stop());
        return;
      }

      const { provider, session: defaults, iceServers } = bootstrapValue;
      setMicTracksEnabled(micStreamValue, !pttMic);

      serverDefaultsRef.current = defaults;

      // Caption scheduler: heuristic fallback for non-Inworld providers (OpenAI).
      // For Inworld we use word-alignment timing exclusively; the scheduler is not created.
      const captionScheduler = provider !== "inworld"
        ? createCaptionScheduler({
            onCaption: (text) => {
              if (!isStale()) setLastCaption(text);
            },
          })
        : null;
      captionScheduler?.setSpeed(defaults.audio.output?.speed);
      captionSchedulerRef.current = captionScheduler;

      const subtitleTrack = createInworldSubtitleTrack({
        onSentenceFlushed: (s, total) => {
          realtimeDebugLog(`[SUBS] SENTENCE ${total - 1} start=${s.start.toFixed(3)} end=${s.end.toFixed(3)} text="${s.text.slice(0, 60)}"`);
        },
      });
      subtitleTrackRef.current = subtitleTrack;
      responseAudioAnchorCtxSecRef.current = null;

      const usePlaybackSpeaking = provider === "inworld" && trackAgentSpeaking;
      let lastAgentSpeaking = false;
      let responseCancelled = false;

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
        captionScheduler: captionScheduler ?? undefined,
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
            if (!isStale()) subtitleTrack.applyChunk(contentIndex, words);
          },
          onResponseStarted: () => {
            if (trackAgentSpeaking && provider !== "inworld" && !isStale()) {
              setAgentSpeaking(true);
            }
            if (usePlaybackSpeaking && !isStale()) {
              lastAgentSpeaking = false;
              responseCancelled = false;
              setAgentSpeaking(false);
            }
            clearAudioAnchorFallback();
            remoteAudioAnchorRef.current?.arm(true);
            subtitleTrack.reset();
            responseAudioAnchorCtxSecRef.current = null;
            if (!isStale()) setLastCaption(null);
            realtimeDebugLog(`[SUBS] RESET (response.created) ctxTime=${remoteAudioAnchorRef.current?.getCtxTime().toFixed(3) ?? "n/a"}`);
          },
          onResponseDone: (info) => {
            if (trackAgentSpeaking && provider !== "inworld" && !isStale()) {
              setAgentSpeaking(false);
            }
            if (usePlaybackSpeaking && !isStale()) {
              const cancelled = info?.status === "cancelled" || info?.status === "failed";
              if (cancelled) {
                responseCancelled = true;
                lastAgentSpeaking = false;
                setAgentSpeaking(false);
              } else if (subtitleTrack.getPlaybackEndSec() == null) {
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
            clearAudioAnchorFallback();
            audioAnchorFallbackTimerRef.current = setTimeout(() => {
              audioAnchorFallbackTimerRef.current = null;
              captionScheduler?.setAudioAnchor(performance.now());
            }, AUDIO_ANCHOR_FALLBACK_DELAY_MS);
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
        micStream: micStreamValue,
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
              onAudioStart: (nowMs, ctxTime) => {
                if (isStale()) return;
                clearAudioAnchorFallback();
                captionScheduler?.setAudioAnchor(nowMs);
                if (responseAudioAnchorCtxSecRef.current == null) {
                  responseAudioAnchorCtxSecRef.current = ctxTime;
                  realtimeDebugLog(`[SUBS] ANCHOR set: anchorCtxSec=${ctxTime.toFixed(3)}`);
                }
              },
              log: realtimeDebugLog,
            });
          } catch { /* remote audio anchor optional */ }
          track.onended = () => {
            clearAudioAnchorFallback();
            remoteAudioAnchorRef.current?.dispose();
            remoteAudioAnchorRef.current = null;
          };
        },
        onEvent: (event) => {
          if (isStale()) return;
          void loop.handleEvent(event);
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
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort || isStale()) {
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
    trackAgentSpeaking,
    buildSessionConfig,
    clearAudioAnchorFallback,
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

  const setAgentOutputMuted = useCallback((muted: boolean) => {
    const el = remoteAudioRef.current;
    if (el) {
      el.muted = muted;
    }
    if (muted) {
      setAgentSpeaking(false);
      captionSchedulerRef.current?.cancel();
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
    sendUserMessage,
    requestAgentResponse,
    setAgentOutputMuted,
    reconfigureSession,
  };
}
