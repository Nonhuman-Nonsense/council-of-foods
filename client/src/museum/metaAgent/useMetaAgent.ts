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

export type MetaAgentConnectionState = "idle" | "connecting" | "ready" | "error";

export type UseMetaAgentParams = {
  language: string;
  liveKey: string;
  instructions: string;
  tools: RealtimeTool[];
  toolHandlers: Record<string, ToolHandler>;
  onCaption?: (text: string | null) => void;
};

export type UseMetaAgentResult = {
  connectionState: MetaAgentConnectionState;
  error: string | null;
  /** Open or close the mic track (track.enabled). No-op if not yet connected. */
  setMicEnabled: (open: boolean) => void;
  /** Inject a user message into the agent conversation (e.g. state snapshot). */
  sendUserMessage: (text: string) => void;
};

function getDebugLevel(): "off" | "basic" {
  try {
    return localStorage.getItem("metaAgentDebug") === "1" ? "basic" : "off";
  } catch {
    return "off";
  }
}

function debugLog(...args: unknown[]): void {
  if (getDebugLevel() === "off") return;
  console.log("[meta-agent]", ...args);
}

/**
 * WebRTC hook for the meeting meta-agent.
 *
 * Key differences from useVoiceGuide:
 *  - Bootstrap requires a liveKey bearer (museum mode + live meeting only).
 *  - Mic gating is done via `track.enabled` (not micGainGate). The connection
 *    is held open throughout the meeting but mic costs nothing in standby.
 *  - No opening greeting — the agent is silent until the visitor speaks.
 *  - Connects on mount; tears down on unmount.
 */
export function useMetaAgent(params: UseMetaAgentParams): UseMetaAgentResult {
  const { language, liveKey, instructions, tools, toolHandlers, onCaption } = params;

  const [connectionState, setConnectionState] = useState<MetaAgentConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);

  const connectionRef = useRef<RealtimeConnection | null>(null);
  const serverDefaultsRef = useRef<RealtimeSessionServerDefaults | null>(null);
  const eventLoopRef = useRef<ReturnType<typeof createEventLoop> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Keep latest handlers/instructions/tools in refs so the event loop always
  // sees current closures without requiring a reconnect on every render.
  const handlersRef = useRef(toolHandlers);
  const instructionsRef = useRef(instructions);
  const toolsRef = useRef(tools);
  useEffect(() => {
    handlersRef.current = toolHandlers;
    instructionsRef.current = instructions;
    toolsRef.current = tools;
  });

  // StrictMode-safe: each start() bumps this; stale in-flight attempts bail.
  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const buildSessionConfig = useCallback((): RealtimeSessionConfig => {
    const defaults = serverDefaultsRef.current;
    if (!defaults) throw new Error("Meta-agent defaults not loaded");
    return mergeRealtimeSessionWithClientConfig(
      defaults,
      instructionsRef.current,
      toolsRef.current,
    );
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    attemptRef.current += 1;
    serverDefaultsRef.current = null;
    eventLoopRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
      } catch { /* ignore */ }
      remoteAudioRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (connectionRef.current || abortRef.current) return;

    const myAttempt = ++attemptRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const isStale = () => myAttempt !== attemptRef.current;

    setConnectionState("connecting");
    setError(null);

    let conn: RealtimeConnection | null = null;
    try {
      const authHeaders = { Authorization: `Bearer ${liveKey}` };

      const [bootResult, micResult] = await Promise.allSettled([
        fetchRealtimeBootstrap(
          { feature: "meta-agent", language },
          debugLog,
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

      // Mic starts disabled — enabled only when visitor holds the button.
      micStream.getAudioTracks().forEach((t) => { t.enabled = false; });

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
          onCaption: (text) => { if (!isStale()) onCaption?.(text); },
          onUserTranscript: () => { /* not used */ },
          onError: (message) => {
            if (isStale()) return;
            setError(message);
            setConnectionState("error");
          },
          log: debugLog,
        },
      });
      eventLoopRef.current = loop;

      conn = await createRealtimeConnection({
        session: defaults,
        iceServers,
        callPath: "/api/realtime/call",
        callHeaders: { "Content-Type": "application/json", ...authHeaders },
        callBodyExtras: { feature: "meta-agent", provider },
        micStream,
        log: debugLog,
        signal: controller.signal,
        onRemoteTrack: (track) => {
          if (isStale()) { try { track.stop(); } catch { /* ignore */ } return; }
          const el = document.createElement("audio");
          el.autoplay = true;
          el.setAttribute("playsinline", "true");
          el.muted = false;
          el.volume = 1.0;
          el.srcObject = new MediaStream([track]);
          el.style.display = "none";
          document.body.appendChild(el);
          remoteAudioRef.current = el;
          void el.play().catch((err) => debugLog("audio play blocked", err));
        },
        onEvent: (event) => {
          if (isStale()) return;
          void loop.handleEvent(event);
        },
        onOpen: () => {
          if (isStale()) return;
          // Apply instructions + tools; no opening greeting — agent waits for visitor.
          loop.configureSession(buildSessionConfig(), { triggerGreetingOnReady: false });
        },
        onClose: (reason) => {
          debugLog("connection closed", reason);
          if (isStale()) return;
          if (reason === "pc_failed" || reason === "dc_error") {
            setError("Meta-agent connection lost");
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
      debugLog("connected", { attempt: myAttempt });
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort || isStale()) {
        debugLog("start aborted", { attempt: myAttempt });
        conn?.close();
        return;
      }
      const msg = e instanceof Error ? e.message : "Meta-agent failed to start";
      debugLog("start failed", msg);
      conn?.close();
      setError(msg);
      setConnectionState("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [language, liveKey, buildSessionConfig, onCaption]);

  // Connect on mount; disconnect on unmount.
  useEffect(() => {
    void start();
    return () => {
      cleanup();
      setConnectionState("idle");
    };
  }, [start, cleanup]);

  const setMicEnabled = useCallback((open: boolean) => {
    connectionRef.current?.micStream.getAudioTracks().forEach((t) => { t.enabled = open; });
  }, []);

  const sendUserMessage = useCallback((text: string) => {
    eventLoopRef.current?.sendUserMessage(text);
  }, []);

  return { connectionState, error, setMicEnabled, sendUserMessage };
}
