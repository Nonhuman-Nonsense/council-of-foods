import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import { createEventLoop } from "@voice/realtimeEventLoop";
import {
  mergeRealtimeSessionWithClientConfig,
  type RealtimeSessionConfig,
  type RealtimeSessionServerDefaults,
} from "@realtime/realtimeProtocol";
import type { RealtimeTool, ToolHandler } from "@voice/guideTools";
import { createCaptionScheduler } from "@voice/captionScheduler";
import { createRemoteAudioAnchor, type RemoteAudioAnchor } from "@voice/remoteAudioAnchor";

const AUDIO_ANCHOR_FALLBACK_DELAY_MS = 600;
const noopLog = () => {};

export type RealtimeVoiceFeature = "meta-agent" | "voice-guide";

export type RealtimeVoiceSessionConnectionState = "idle" | "connecting" | "ready" | "error";

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
  /** Expose `agentSpeaking` between response.created and response.done. */
  trackAgentSpeaking?: boolean;
  /** Voice-guide: optional remote audio sink (created on body if absent). */
  audioElement?: HTMLAudioElement | null;
  /** When false, tear down WebRTC (voice-guide muted). Default true. */
  sessionActive?: boolean;
  /** Connect when `sessionActive` (voice-guide `autoStart`). Default true. */
  autoConnect?: boolean;
  defaultsNotLoadedError?: string;
  connectionLostMessage?: string;
  startFailedMessage?: string;
};

export type UseRealtimeVoiceSessionResult = {
  connectionState: RealtimeVoiceSessionConnectionState;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  hasReceivedAudioPart: boolean;
  agentSpeaking: boolean;
  setMicEnabled: (open: boolean) => void;
  sendUserMessage: (text: string) => void;
  /** Ask the model to respond when no response is in flight. */
  requestAgentResponse: () => void;
  setAgentOutputMuted: (muted: boolean) => void;
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
    defaultsNotLoadedError = "Realtime defaults not loaded",
    connectionLostMessage = "Realtime connection lost",
    startFailedMessage = "Realtime session failed to start",
  } = params;

  const authHeadersKey = authHeaders ? JSON.stringify(authHeaders) : "";

  const [connectionState, setConnectionState] =
    useState<RealtimeVoiceSessionConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [lastUserTranscript, setLastUserTranscript] = useState<string | null>(null);
  const [hasReceivedAudioPart, setHasReceivedAudioPart] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const audioElementRef = useRef(audioElement);
  const serverDefaultsRef = useRef<RealtimeSessionServerDefaults | null>(null);
  const eventLoopRef = useRef<ReturnType<typeof createEventLoop> | null>(null);
  const captionSchedulerRef = useRef<ReturnType<typeof createCaptionScheduler> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioAnchorRef = useRef<RemoteAudioAnchor | null>(null);
  const audioAnchorFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlersRef = useRef(toolHandlers);
  const instructionsRef = useRef(instructions);
  const toolsRef = useRef(tools);
  useEffect(() => {
    handlersRef.current = toolHandlers;
    instructionsRef.current = instructions;
    toolsRef.current = tools;
  });

  useEffect(() => {
    audioElementRef.current = audioElement;
  }, [audioElement]);

  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const buildSessionConfig = useCallback((): RealtimeSessionConfig => {
    const defaults = serverDefaultsRef.current;
    if (!defaults) throw new Error(defaultsNotLoadedError);
    return mergeRealtimeSessionWithClientConfig(
      defaults,
      instructionsRef.current,
      toolsRef.current,
    );
  }, [defaultsNotLoadedError]);

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
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    attemptRef.current += 1;
    serverDefaultsRef.current = null;
    clearAudioAnchorFallback();
    if (userTranscriptTimerRef.current) {
      clearTimeout(userTranscriptTimerRef.current);
      userTranscriptTimerRef.current = null;
    }
    captionSchedulerRef.current?.cancel();
    captionSchedulerRef.current = null;
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
  }, [clearAudioAnchorFallback]);

  const start = useCallback(async () => {
    if (connectionRef.current || abortRef.current) return;

    const myAttempt = ++attemptRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => myAttempt !== attemptRef.current;

    setConnectionState("connecting");
    setError(null);
    setHasReceivedAudioPart(false);

    let conn: RealtimeConnection | null = null;
    try {
      const [bootResult, micResult] = await Promise.allSettled([
        fetchRealtimeBootstrap(
          { feature, language },
          noopLog,
          controller.signal,
          authHeaders,
        ),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
      ]);

      if (bootResult.status === "rejected") {
        if (micResult.status === "fulfilled") micResult.value.getTracks().forEach((t) => t.stop());
        throw bootResult.reason;
      }
      if (micResult.status === "rejected") throw micResult.reason;
      if (isStale()) {
        micResult.value.getTracks().forEach((t) => t.stop());
        return;
      }

      const { provider, session: defaults, iceServers } = bootResult.value;
      const micStream = micResult.value;
      setMicTracksEnabled(micStream, !pttMic);

      serverDefaultsRef.current = defaults;

      const captionScheduler = createCaptionScheduler({
        onCaption: (text) => {
          if (!isStale()) setLastCaption(text);
        },
      });
      captionScheduler.setSpeed(defaults.audio.output?.speed);
      captionSchedulerRef.current = captionScheduler;

      let activeConn: RealtimeConnection | null = null;
      const sendOnDc = (payload: unknown) => {
        const dc = activeConn?.dc ?? connectionRef.current?.dc;
        if (!dc || dc.readyState !== "open") return;
        dc.send(JSON.stringify(payload));
      };

      const loop = createEventLoop({
        send: sendOnDc,
        getCtx: () => ({ toolHandlers: handlersRef.current }),
        captionScheduler,
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
            setError(message);
            setConnectionState("error");
          },
          onResponseStarted: () => {
            if (trackAgentSpeaking && !isStale()) setAgentSpeaking(true);
            clearAudioAnchorFallback();
            remoteAudioAnchorRef.current?.arm();
          },
          onResponseDone: () => {
            if (trackAgentSpeaking && !isStale()) setAgentSpeaking(false);
          },
          onAudioPartReady: () => {
            if (!isStale()) setHasReceivedAudioPart(true);
            clearAudioAnchorFallback();
            audioAnchorFallbackTimerRef.current = setTimeout(() => {
              audioAnchorFallbackTimerRef.current = null;
              captionScheduler.setAudioAnchor(performance.now());
            }, AUDIO_ANCHOR_FALLBACK_DELAY_MS);
          },
          log: noopLog,
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
        callBodyExtras: { feature, provider },
        micStream,
        log: noopLog,
        signal: controller.signal,
        onRemoteTrack: (track) => {
          if (isStale()) { try { track.stop(); } catch { /* ignore */ } return; }
          const el = attachRemoteAudio(track, audioElementRef.current ?? null);
          remoteAudioRef.current = el;
          try {
            remoteAudioAnchorRef.current?.dispose();
            remoteAudioAnchorRef.current = createRemoteAudioAnchor({
              track,
              onAudioStart: (nowMs) => {
                if (isStale()) return;
                clearAudioAnchorFallback();
                captionScheduler.setAudioAnchor(nowMs);
              },
              log: noopLog,
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
          if (reason === "pc_failed" || reason === "dc_error") {
            setError(connectionLostMessage);
            setConnectionState("error");
          }
        },
      });

      if (isStale()) {
        conn.close();
        return;
      }

      activeConn = conn;
      connectionRef.current = conn;
      setConnectionState("ready");
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort || isStale()) {
        conn?.close();
        return;
      }
      const msg = e instanceof Error ? e.message : startFailedMessage;
      conn?.close();
      setError(msg);
      setConnectionState("error");
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
    connectionLostMessage,
    startFailedMessage,
    triggerGreetingOnReady,
    authHeaders,
  ]);

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
      return;
    }
    if (!autoConnect) return;
    void start();
    return () => {
      cleanup();
      setConnectionState("idle");
    };
  }, [sessionActive, autoConnect, start, cleanup, resetSessionUiState]);

  const setMicEnabled = useCallback((open: boolean) => {
    setMicTracksEnabled(connectionRef.current?.micStream, open);
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

  return {
    connectionState,
    error,
    lastCaption,
    lastUserTranscript,
    hasReceivedAudioPart,
    agentSpeaking,
    setMicEnabled,
    sendUserMessage,
    requestAgentResponse,
    setAgentOutputMuted,
  };
}
