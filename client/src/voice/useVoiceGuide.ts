import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeTool, ToolHandler } from "./guideTools";
import {
  createRealtimeConnection,
  fetchVoiceGuideBootstrap,
  type RealtimeConnection,
} from "./realtimeConnection";
import { createEventLoop } from "./realtimeEventLoop";
import {
  mergeVoiceGuideRealtimeSession,
  type RealtimeSessionConfig,
  type RealtimeSessionServerDefaults,
} from "./realtimeProtocol";

type VoiceGuideStatus = "idle" | "connecting" | "connected" | "error";

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
};

export type VoiceGuideState = {
  status: VoiceGuideStatus;
  error: string | null;
  lastCaption: string | null;
  lastUserTranscript: string | null;
  start: () => Promise<void>;
  stop: () => void;
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
  if (!audioElement) {
    if (getDebugLevel() === "off") {
      el.style.display = "none";
    } else {
      el.controls = true;
      el.style.position = "fixed";
      el.style.left = "12px";
      el.style.bottom = "12px";
      el.style.zIndex = "10000";
    }
    document.body.appendChild(el);
  }
  void el.play().catch((err) => debugLog("audio play blocked", err));
  return el;
}

/**
 * React glue around the pure realtimeConnection + realtimeEventLoop modules.
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
 *    (`GET /api/voice-guide/bootstrap`, backed by GlobalOptions).
 *    Instructions and tool schemas stay on the client.
 *  - StrictMode-safe: `start()` uses an attempt counter + AbortController so
 *    the dev-only mount → unmount → mount cycle doesn't leak two parallel
 *    WebRTC connections.
 */
export function useVoiceGuide(params: UseVoiceGuideParams): VoiceGuideState {
  const { instructions, tools, toolHandlers, audioElement, autoStart = true } = params;

  const [status, setStatus] = useState<VoiceGuideStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [lastUserTranscript, setLastUserTranscript] = useState<string | null>(null);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
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
  /** Set after a successful `GET /api/voice-guide/bootstrap` during `start()`. */
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
    return mergeVoiceGuideRealtimeSession(defaults, instructionsRef.current, toolsRef.current);
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
  }, [audioElement]);

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
    setError(null);
  }, [cleanup]);

  const start = useCallback(async () => {
    // Already connected/connecting? Don't spawn a duplicate.
    if (connectionRef.current || abortRef.current) return;

    const myAttempt = ++attemptRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const isStale = () => myAttempt !== attemptRef.current;

    setStatus("connecting");
    setError(null);

    let conn: RealtimeConnection | null = null;
    try {
      const settled = await Promise.allSettled([
        fetchVoiceGuideBootstrap(debugLog, controller.signal),
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
            if (!isStale()) setLastUserTranscript(text);
          },
          onError: (message) => {
            if (isStale()) return;
            setError(message);
            setStatus("error");
          },
          onSessionReady: () => debugLog("session ready"),
          log: debugLog,
        },
      });

      conn = await createRealtimeConnection({
        session: buildSessionConfig(),
        iceServers,
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
          track.onended = () => debugLog("remote track ended");
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
  }, [audioElement, buildSessionConfig]);

  // Auto-start (default) and unconditional teardown on unmount.
  useEffect(() => {
    if (autoStart) void start();
    return () => {
      cleanup();
      setStatus("idle");
    };
    // Intentionally mount/unmount-only: start and cleanup are stable, and
    // autoStart is treated as a mount-time prop.
  }, []);

  return { status, error, lastCaption, lastUserTranscript, start, stop };
}
