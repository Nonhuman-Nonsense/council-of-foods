import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeTool, ToolHandler } from "./guideTools";
import {
  createRealtimeConnection,
  fetchRealtimeBootstrap,
  type RealtimeConnection,
} from "@realtime/realtimeConnection";
import { createEventLoop } from "./realtimeEventLoop";
import {
  mergeRealtimeSessionWithClientConfig,
  type RealtimeSessionConfig,
  type RealtimeSessionServerDefaults,
} from "@realtime/realtimeProtocol";
import { createCaptionScheduler, type CaptionScheduler } from "./captionScheduler";
import { createRemoteAudioAnchor, type RemoteAudioAnchor } from "./remoteAudioAnchor";

type VoiceGuideStatus = "idle" | "connecting" | "connected" | "error";

const AUDIO_ANCHOR_FALLBACK_DELAY_MS = 600;

export type UseVoiceGuideParams = {
  /** System instructions/prompt. */
  instructions: string;
  /** Realtime function tools. May change between renders. */
  tools: RealtimeTool[];
  /** Tool handlers, keyed by tool name. May change between renders. */
  toolHandlers: Record<string, ToolHandler>;
  /** Optional remote audio sink; one is created and appended to body if absent. */
  audioElement?: HTMLAudioElement | null;
  /**
   * If true (default), the hook automatically starts a connection on mount
   * and cleans up on unmount. Survives React StrictMode's double-mount in
   * dev (in-flight start is aborted by the cleanup).
   */
  autoStart?: boolean;
  /** If true, begin with WebRTC disconnected until the user unmutes (default false). */
  initialMuted?: boolean;
};

export type VoiceGuideState = {
  /** True while bootstrapping / handshaking (only when not muted). */
  isConnecting: boolean;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  /** When true, WebRTC is torn down (no mic, no remote audio). */
  muted: boolean;
  setMuted: (muted: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  /** Send a manual user message to the conversation transcript (e.g. state sync). */
  sendUserMessage: (text: string) => void;
};

function getDebugLevel(): "off" | "basic" | "verbose" {
  try {
    const v = localStorage.getItem("voiceGuideDebug");
    if (v === "verbose") return "verbose";
    if (v === "1") return "basic";
    return "off";
  } catch {
    return "off";
  }
}

function debugLog(...args: unknown[]): void {
  if (getDebugLevel() === "off") return;
  console.log("[voice-guide]", ...args);
}

function attachRemoteAudio(track: MediaStreamTrack, audioElement: HTMLAudioElement | null): HTMLAudioElement {
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
  void el.play().catch((err) => debugLog("audio play blocked", err));
  return el;
}

/**
 * React glue around the pure @realtime/realtimeConnection + realtimeEventLoop modules.
 *
 * Design choices:
 *  - Tools / handlers live in a ref, so `start()` doesn't re-bind on every
 *    render and the event loop always sees the latest closures.
 *  - Per Inworld's WebRTC docs, the canonical way to apply session config
 *    (instructions, tools, voice, …) is to send `session.update` as soon as
 *    the data channel opens, then wait for `session.updated` before the
 *    first `response.create`. The `session` field in the `/v1/realtime/calls`
 *    JSON body is partially honored at best — for tools/instructions we MUST
 *    use `session.update`. Skipping this caused "server_error" on the first
 *    auto-greeting and tool-less chitchat afterwards.
 *  - Model, voice, TTS, transcription, VAD, and audio speed come from the server
 *    (`POST /api/realtime/bootstrap` with `feature: "voice-guide"`, backed by GlobalOptions).
 *    Instructions and tool schemas stay on the client.
 *  - StrictMode-safe: `start()` uses an attempt counter + AbortController so
 *    the dev-only mount → unmount → mount cycle doesn't leak two parallel
 *    WebRTC connections.
 */
export function useVoiceGuide(params: UseVoiceGuideParams): VoiceGuideState {
  const { instructions, tools, toolHandlers, audioElement, autoStart = true, initialMuted = false } = params;

  const [muted, setMuted] = useState(initialMuted);
  const [status, setStatus] = useState<VoiceGuideStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [lastUserTranscript, setLastUserTranscript] = useState<string | null>(null);
  const [hasSeenFirstGreetingAudio, setHasSeenFirstGreetingAudio] = useState(false);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioAnchorRef = useRef<RemoteAudioAnchor | null>(null);
  const audioAnchorFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionSchedulerRef = useRef<CaptionScheduler | null>(null);
  const userTranscriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventLoopRef = useRef<ReturnType<typeof createEventLoop> | null>(null);
  /**
   * Each call to start() bumps this counter and creates a fresh AbortController.
   * Any prior in-flight start observes its old controller has been aborted and
   * bails out before establishing a connection. This is what makes the hook
   * safe under React StrictMode's mount → unmount → mount cycle in dev.
   */
  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Latest tool handlers + config, kept in refs so the event loop and the
  // session config builder always see the latest values without re-binding.
  const handlersRef = useRef<Record<string, ToolHandler>>(toolHandlers);
  const instructionsRef = useRef(instructions);
  const toolsRef = useRef(tools);
  /** Set after a successful voice-guide bootstrap during `start()`. */
  const serverDefaultsRef = useRef<RealtimeSessionServerDefaults | null>(null);
  useEffect(() => {
    handlersRef.current = toolHandlers;
    instructionsRef.current = instructions;
    toolsRef.current = tools;
  });

  const buildSessionConfig = useCallback((): RealtimeSessionConfig => {
    const defaults = serverDefaultsRef.current;
    if (!defaults) {
      throw new Error("Voice guide realtime defaults not loaded");
    }
    return mergeRealtimeSessionWithClientConfig(defaults, instructionsRef.current, toolsRef.current);
  }, []);

  const clearAudioAnchorFallback = useCallback(() => {
    if (audioAnchorFallbackTimerRef.current != null) {
      clearTimeout(audioAnchorFallbackTimerRef.current);
      audioAnchorFallbackTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    // Cancel any in-flight start(): aborts fetches and getUserMedia, and
    // makes the start() promise observe the abort and tear down what it had.
    abortRef.current?.abort();
    abortRef.current = null;
    // Bump the attempt counter so any in-flight start that's past its abort
    // checks still recognises itself as superseded.
    attemptRef.current += 1;

    serverDefaultsRef.current = null;
    clearAudioAnchorFallback();
    if (userTranscriptTimerRef.current) {
      clearTimeout(userTranscriptTimerRef.current);
      userTranscriptTimerRef.current = null;
    }
    captionSchedulerRef.current?.cancel();
    captionSchedulerRef.current = null;

    remoteAudioAnchorRef.current?.dispose();
    remoteAudioAnchorRef.current = null;

    connectionRef.current?.close();
    connectionRef.current = null;

    if (remoteAudioRef.current && remoteAudioRef.current !== audioElement) {
      try {
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
      } catch {
        // ignore
      }
    }
    remoteAudioRef.current = null;
  }, [audioElement, clearAudioAnchorFallback]);

  const stop = useCallback(() => {
    setMuted(true);
  }, []);

  const start = useCallback(async () => {
    // Already connected/connecting? Don't spawn a duplicate.
    if (connectionRef.current || abortRef.current) return;

    const myAttempt = ++attemptRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const isStale = () => myAttempt !== attemptRef.current;

    setStatus("connecting");
    setError(null);
    setHasSeenFirstGreetingAudio(false);

    let conn: RealtimeConnection | null = null;
    try {
      const settled = await Promise.allSettled([
        fetchRealtimeBootstrap({ feature: "voice-guide" }, debugLog, controller.signal),
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }),
      ]);
      const bootResult = settled[0];
      const micResult = settled[1];
      if (bootResult.status === "rejected") {
        if (micResult.status === "fulfilled") {
          micResult.value.getTracks().forEach((t) => t.stop());
        }
        throw bootResult.reason;
      }
      if (micResult.status === "rejected") {
        throw micResult.reason;
      }
      const { session: defaults, iceServers } = bootResult.value;
      const micStream = micResult.value;
      if (isStale()) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }
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
            setStatus("error");
          },
          onResponseStarted: () => {
            clearAudioAnchorFallback();
            remoteAudioAnchorRef.current?.arm();
          },
          onAudioPartReady: () => {
            if (!isStale()) setHasSeenFirstGreetingAudio(true);
            clearAudioAnchorFallback();
            audioAnchorFallbackTimerRef.current = setTimeout(() => {
              audioAnchorFallbackTimerRef.current = null;
              captionScheduler.setAudioAnchor(performance.now());
              debugLog("caption audio anchor fallback fired");
            }, AUDIO_ANCHOR_FALLBACK_DELAY_MS);
          },
          onSessionReady: () => debugLog("session ready"),
          log: debugLog,
        },
      });
      eventLoopRef.current = loop;

      conn = await createRealtimeConnection({
        session: buildSessionConfig(),
        iceServers,
        callPath: "/api/realtime/call",
        callBodyExtras: {
          feature: "voice-guide",
          provider: "inworld",
        },
        micStream,
        log: debugLog,
        signal: controller.signal,
        onRemoteTrack: (track) => {
          if (isStale()) {
            try {
              track.stop();
            } catch { /* ignore */ }
            return;
          }
          remoteAudioRef.current = attachRemoteAudio(track, audioElement ?? null);
          try {
            remoteAudioAnchorRef.current?.dispose();
            remoteAudioAnchorRef.current = createRemoteAudioAnchor({
              track,
              onAudioStart: (nowMs) => {
                if (isStale()) return;
                clearAudioAnchorFallback();
                captionScheduler.setAudioAnchor(nowMs);
              },
              log: debugLog,
            });
          } catch (err) {
            debugLog("remote audio anchor unavailable", err);
          }
          track.onended = () => {
            debugLog("remote track ended");
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
          // Apply the full session config (instructions + tools + audio) and
          // queue the opening greeting; the loop will fire response.create
          // once `session.updated` arrives so the model sees our tools.
          loop.configureSession(buildSessionConfig(), { triggerGreetingOnReady: true });
        },
        onClose: (reason) => {
          debugLog("connection closed", reason);
          if (isStale()) return;
          if (reason === "pc_failed" || reason === "dc_error") {
            setStatus("error");
            setError("Voice guide connection lost");
          }
        },
      });

      // If the attempt was superseded mid-handshake, throw away this brand
      // new connection rather than letting it linger.
      if (isStale()) {
        debugLog("start superseded; closing new connection");
        conn.close();
        return;
      }

      activeConn = conn;
      connectionRef.current = conn;
      setStatus("connected");
      debugLog("connected", { attempt: myAttempt });
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort || isStale()) {
        debugLog("start aborted", { attempt: myAttempt });
        conn?.close();
        return;
      }
      const msg = e instanceof Error ? e.message : "Voice guide failed to start";
      debugLog("start failed", msg);
      conn?.close();
      setError(msg);
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [audioElement, buildSessionConfig, clearAudioAnchorFallback]);

  // Unconditional teardown on unmount.
  useEffect(() => {
    return () => {
      cleanup();
      setStatus("idle");
    };
  }, [cleanup]);

  // When muted, tear down WebRTC; when unmuted and autoStart, connect.
  useEffect(() => {
    if (muted) {
      cleanup();
      setStatus("idle");
      setError(null);
      setLastCaption(null);
      setLastUserTranscript(null);
      setHasSeenFirstGreetingAudio(false);
      return;
    }
    if (!autoStart) return;
    void start();
  }, [muted, autoStart, cleanup, start]);

  const sendUserMessage = useCallback((text: string) => {
    eventLoopRef.current?.sendUserMessage(text);
  }, []);

  return {
    isConnecting: status === "connecting" || (status === "connected" && !hasSeenFirstGreetingAudio),
    error,
    lastCaption,
    lastUserTranscript,
    muted,
    setMuted,
    start: async () => {
      setMuted(false);
    },
    stop,
    sendUserMessage,
  };
}
