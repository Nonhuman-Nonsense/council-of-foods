/**
 * Pure event-loop for the Inworld Realtime data channel.
 *
 * Why a separate module:
 *  - The previous implementation defined `dc.onmessage` inside the React hook,
 *    which captured stale closures over tool handlers and wizard state.
 *  - This module accepts a `getCtx` lookup that always returns the latest
 *    handlers/state from a ref. No re-creation of listeners needed.
 *  - It also tracks "is a response currently in flight?" so we don't dogpile
 *    `response.create` after every tool call (a major source of the
 *    cascading `status: "cancelled"` events we saw in production logs).
 */

import type { RealtimeSessionConfig } from "./realtimeProtocol";
import type { ToolHandler, ToolResult } from "./guideTools";

export type RealtimeEventCtx = {
  /** Tool name -> handler. May change per render. */
  toolHandlers: Record<string, ToolHandler>;
};

export type EventLoopCallbacks = {
  /** Latest assistant audio transcript line (caption). null clears it. */
  onCaption: (text: string | null) => void;
  /** Latest user transcription line. */
  onUserTranscript: (text: string) => void;
  /** Reported error (e.g. session-level error). */
  onError: (message: string) => void;
  /** Fired when the server confirms the session config was applied. */
  onSessionReady?: () => void;
  /** Optional debug hook. */
  log?: (...args: unknown[]) => void;
};

export type ConfigureSessionOptions = {
  /**
   * If true, automatically send `response.create` once the server confirms
   * the session config with `session.updated`. Used for the opening greeting
   * so it's generated with the configured instructions + tools.
   */
  triggerGreetingOnReady?: boolean;
};

export type EventLoop = {
  /** Feed an incoming event. Returns true if the event was recognised. */
  handleEvent: (event: unknown) => Promise<boolean>;
  /** Trigger a response.create only if no response is currently in flight. */
  requestResponseIfIdle: () => boolean;
  /** Whether a response is currently in flight (between created and done). */
  isResponseActive: () => boolean;
  /** Send `session.update` with the given config; optionally queue a greeting. */
  configureSession: (session: RealtimeSessionConfig, options?: ConfigureSessionOptions) => void;
};

type FunctionCallMeta = { name?: string; call_id?: string };

function asObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Build an event loop bound to a data channel + a context lookup. */
export function createEventLoop(params: {
  send: (payload: unknown) => void;
  getCtx: () => RealtimeEventCtx;
  callbacks: EventLoopCallbacks;
}): EventLoop {
  const { send, getCtx, callbacks } = params;
  const log = callbacks.log ?? (() => undefined);

  let activeResponses = 0;
  /** Function-call item_id → metadata (call_id, name). */
  const functionCallMeta = new Map<string, FunctionCallMeta>();
  /** True after we've seen a `session.updated` for the most recent update. */
  let sessionReady = false;
  /** True if we should fire response.create the moment the session is ready. */
  let pendingGreeting = false;

  const isResponseActive = () => activeResponses > 0;

  const requestResponseIfIdle = (): boolean => {
    if (activeResponses > 0) {
      log("skip response.create: already active", { activeResponses });
      return false;
    }
    if (!sessionReady) {
      // Don't fire greetings before the session is configured: the model
      // would run with default instructions/tools and produce server_error
      // (observed) or topic-less chitchat (also observed).
      log("skip response.create: session not yet ready");
      pendingGreeting = true;
      return false;
    }
    send({ type: "response.create" });
    return true;
  };

  const trySendJson = (payload: unknown) => {
    try {
      send(payload);
    } catch (e) {
      log("send failed", e);
    }
  };

  const configureSession = (
    session: RealtimeSessionConfig,
    options?: ConfigureSessionOptions
  ): void => {
    sessionReady = false;
    if (options?.triggerGreetingOnReady) pendingGreeting = true;
    log("send session.update", {
      instructionsLen: session.instructions.length,
      tools: session.tools.length,
      voice: session.audio?.output?.voice,
      model: session.model,
    });
    trySendJson({ type: "session.update", session });
  };

  const handleEvent = async (event: unknown): Promise<boolean> => {
    const obj = asObj(event);
    if (!obj) return false;
    const type = asStr(obj.type);
    if (!type) return false;
    log("event", type);

    if (type === "session.updated") {
      sessionReady = true;
      callbacks.onSessionReady?.();
      if (pendingGreeting) {
        pendingGreeting = false;
        if (activeResponses === 0) {
          send({ type: "response.create" });
        }
      }
      return true;
    }

    if (type === "response.created") {
      activeResponses += 1;
      return true;
    }

    if (type === "response.done") {
      activeResponses = Math.max(0, activeResponses - 1);
      const r = obj.response as { status?: string; status_details?: unknown } | undefined;
      if (r?.status === "failed") log("response.failed", r.status_details);
      return true;
    }

    if (type === "response.output_item.added") {
      const item = (obj as { item?: { type?: string; id?: string; call_id?: string; name?: string } }).item;
      if (item?.type === "function_call" && item.id) {
        functionCallMeta.set(item.id, { call_id: item.call_id, name: item.name });
      }
      return true;
    }

    if (type === "response.function_call_arguments.done") {
      const itemId = asStr(obj.item_id);
      const argsStr = asStr(obj.arguments);
      if (!itemId || argsStr == null) return true;
      const meta = functionCallMeta.get(itemId);
      const name = meta?.name;
      const callId = meta?.call_id ?? itemId;
      if (!name) return true;

      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(argsStr);
      } catch {
        parsedArgs = {};
      }

      const handler = getCtx().toolHandlers[name];
      const result: ToolResult = handler
        ? await Promise.resolve(handler(parsedArgs))
        : { ok: false, error: `No handler for tool: ${name}` };

      trySendJson({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      });

      // Only ask the model to continue if nothing else is currently producing
      // a response. With semantic_vad + create_response: true the server may
      // already be producing one for the next user turn; queueing another one
      // here is what caused the cancel-cascade in the old hook.
      requestResponseIfIdle();
      functionCallMeta.delete(itemId);
      return true;
    }

    if (type === "response.output_audio_transcript.delta") {
      // We surface the .done event below; ignore deltas to avoid duplicated
      // accumulation (the .done event has the full transcript).
      return true;
    }

    if (type === "response.output_audio_transcript.done") {
      const transcript = asStr(obj.transcript);
      if (transcript && transcript.trim().length > 0) {
        callbacks.onCaption(transcript);
      }
      return true;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = asStr(obj.transcript);
      if (transcript && transcript.trim().length > 0) {
        callbacks.onUserTranscript(transcript);
        callbacks.onCaption(null);
      }
      return true;
    }

    if (type === "error") {
      const errObj = (obj.error ?? {}) as { message?: unknown };
      const message = asStr(errObj.message) ?? "Voice guide error";
      callbacks.onError(message);
      return true;
    }

    // Speech VAD events: useful for diagnostics but not actionable here.
    if (type === "input_audio_buffer.speech_started" || type === "input_audio_buffer.speech_stopped") {
      return true;
    }

    return false;
  };

  return { handleEvent, requestResponseIfIdle, isResponseActive, configureSession };
}
