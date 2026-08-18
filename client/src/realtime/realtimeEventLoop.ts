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

import type { RealtimeSessionConfig } from "@realtime/realtimeProtocol";
import type { ToolHandler, ToolResult } from "./realtimeTools";
import { log as devLog, summarizeLogPayload } from "@/logger";

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
  /** Fired when an assistant response begins, before audio is audible. */
  onResponseStarted?: () => void;
  /** Fired when an assistant response completes (`response.done`). */
  onResponseDone?: (info?: { status?: string }) => void;
  /** Fired when the data channel reports that the audio content part exists. */
  onAudioPartReady?: () => void;
  /**
   * Fired for every `response.output_audio.delta` that carries word alignment.
   * Words are in arrival order; an empty array signals end-of-sentence.
   */
  onWordAlignment?: (
    contentIndex: number,
    words: ReadonlyArray<{ w: string; s: number; e: number }>
  ) => void;
};

/** Synthetic user turn that kicks off the first assistant reply (Inworld WebRTC quickstart pattern). */
const DEFAULT_GREETING_USER_TEXT =
  "The session just connected. Give your opening greeting now, following your instructions.";

export type ConfigureSessionOptions = {
  /**
   * If true, automatically send `response.create` once the server confirms
   * the session config with `session.updated`. Used for the opening greeting
   * so it's generated with the configured instructions + tools.
   */
  triggerGreetingOnReady?: boolean;
  /**
   * Queue the greeting but do not send it yet. The session can then connect
   * long before the browser will let anything be heard — the greeting is a live
   * stream, not a buffer, so speaking into a blocked audio element loses the
   * words outright. Release it with `setGreetingHeld(false)`.
   */
  holdGreeting?: boolean;
  /**
   * Text for the synthetic `conversation.item.create` (user message) sent
   * immediately before the opening `response.create`. Some models error with
   * `server_error` if `response.create` runs on an empty transcript; Inworld's
   * docs send this user item before `response.create` in the WebRTC sample.
   */
  greetingUserText?: string;
};

export type EventLoop = {
  /** Feed an incoming event. Returns true if the event was recognised. */
  handleEvent: (event: unknown) => Promise<boolean>;
  /** Trigger a response.create only if no response is currently in flight. */
  requestResponseIfIdle: () => boolean;
  /** Whether a response is currently in flight (between created and done). */
  isResponseActive: () => boolean;
  /**
   * Release (or re-hold) a greeting queued behind `holdGreeting`. Releasing
   * sends it immediately if the session is ready and idle.
   */
  setGreetingHeld: (held: boolean) => void;
  /** Send `session.update` with the given config; optionally queue a greeting. */
  configureSession: (session: RealtimeSessionConfig, options?: ConfigureSessionOptions) => void;
  /** Send a manual user message to the conversation transcript. */
  sendUserMessage: (text: string) => void;
  /** Cancel any in-flight model response (sends response.cancel). */
  cancelActiveResponse: () => void;
  /**
   * Barge-in: cancel any in-flight response, truncate the assistant's
   * last-spoken audio item to what was actually heard (if known), clear the
   * server's buffered output audio (`output_audio_buffer.clear`), then send
   * the given user message and request a new response — regardless of
   * whether a response is currently active. Used for click-reactions that
   * must cut off whatever the agent is currently saying, mirroring
   * server-VAD interrupt.
   */
  interruptAndRespond: (
    userText: string,
    options?: { reason?: string; audioElapsedMs?: number }
  ) => void;
};

type FunctionCallMeta = { name?: string; call_id?: string };

function asObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Does this `error` event reject the `response.create` we're still waiting on?
 *
 * The provider echoes our `event_id` back on errors it can attribute to a
 * specific client event, which is the reliable signal. When it can't (some
 * `server_error`s arrive without one), fall back to matching the error text so
 * an uncorrelated rejection still recovers rather than stranding the turn.
 */
function isResponseCreateRejection(errRaw: unknown, pendingEventId: string): boolean {
  const e = asObj(errRaw);
  const eventId = asStr(e?.event_id);
  if (eventId) return eventId === pendingEventId;
  const code = asStr(e?.code) ?? "";
  const message = asStr(e?.message) ?? "";
  return code.includes("response_create") || message.includes("response.create");
}

/** Build an event loop bound to a data channel + a context lookup. */
export function createEventLoop(params: {
  send: (payload: unknown) => void;
  getCtx: () => RealtimeEventCtx;
  callbacks: EventLoopCallbacks;
}): EventLoop {
  const { send, getCtx, callbacks } = params;

  let activeResponses = 0;
  /** Function-call item_id → metadata (call_id, name). */
  const functionCallMeta = new Map<string, FunctionCallMeta>();
  /** True after we've seen a `session.updated` for the most recent update. */
  let sessionReady = false;
  /** If set, after `session.updated` send this user item then `response.create`. */
  let pendingOpeningGreeting: string | null = null;
  /** While true, a queued greeting waits rather than being sent on session.updated. */
  let greetingHeld = false;
  /** Set when `requestResponseIfIdle` runs before `session.updated` (e.g. tool output); flush with bare `response.create`. */
  let pendingDeferredResponse = false;
  /** True once the in-flight response has emitted any output (audio/text/tool). */
  let sawOutputThisResponse = false;
  /** Empty-response recovery attempts for the current user turn (reset per turn). */
  let emptyResponseRetries = 0;
  /**
   * The server occasionally auto-creates a response (semantic_vad
   * `create_response`) that completes with zero output — observed on the first
   * turn after a (re)connect + greeting, on landing and after switch_language.
   * A fresh `response.create` against the same context then works, so we retry
   * once per turn. Capped to avoid an empty→retry→empty loop.
   */
  const MAX_EMPTY_RESPONSE_RETRIES = 1;

  /** Reason for the response.create we just sent; consumed by response.created. */
  let pendingCreateReason: string | null = null;
  /**
   * `event_id` of the response.create we're waiting on, so an `error` event can
   * be correlated back to it. Cleared by `response.created` (accepted) or by the
   * rejection path below.
   */
  let pendingCreateEventId: string | null = null;
  let responseCreateEventCounter = 0;
  /**
   * Rejected-`response.create` recovery attempts for the current user turn.
   *
   * A rejected create never yields `response.created` *or* `response.done`, so
   * the empty-response recovery further down never fires and the visitor's turn
   * dies in silence. Tracked separately from `emptyResponseRetries` so the two
   * failure modes stay distinguishable in the TURN logs.
   */
  let createRejectedRetries = 0;
  const MAX_CREATE_REJECTED_RETRIES = 1;
  /** Reason the in-flight response was created ("server-auto" if we didn't send it). */
  let currentResponseReason = "server-auto";
  /**
   * item_id/content_index of the current (or most recently spoken) assistant
   * audio content part. Used by `interruptAndRespond` to send
   * `conversation.item.truncate` so the server's transcript matches what the
   * visitor actually heard, not what the model finished generating.
   */
  let currentAssistantAudioItemId: string | null = null;
  let currentAssistantAudioContentIndex: number | null = null;
  /** Most recent user transcript text (for correlating in logs). */
  let lastUserTranscript = "";

  const sendResponseCreate = (reason: string): void => {
    responseCreateEventCounter += 1;
    const eventId = `cof_response_create_${responseCreateEventCounter}`;
    pendingCreateReason = reason;
    pendingCreateEventId = eventId;
    devLog.flat("TURN", "OUT response.create", { reason, eventId, lastUserTranscript });
    send({ type: "response.create", event_id: eventId });
  };

  const isResponseActive = () => activeResponses > 0;

  const requestResponseIfIdle = (reason = "idle-request"): boolean => {
    if (activeResponses > 0) {
      devLog.flat("TURN", "skip response.create: already active", { reason, activeResponses });
      return false;
    }
    if (!sessionReady) {
      // Don't fire before the session is configured: the model would run with
      // default instructions/tools and produce server_error (observed).
      devLog.flat("TURN", "skip response.create: session not ready", { reason });
      pendingDeferredResponse = true;
      return false;
    }
    sendResponseCreate(reason);
    return true;
  };

  const cancelActiveResponse = (): void => {
    if (activeResponses > 0) {
      send({ type: "response.cancel" });
    }
    callbacks.onCaption(null);
  };

  const interruptAndRespond = (
    userText: string,
    options?: { reason?: string; audioElapsedMs?: number }
  ): void => {
    const reason = options?.reason ?? "interrupt-request";
    if (activeResponses > 0) {
      devLog.flat("TURN", "OUT response.cancel (interrupt)", { reason });
      send({ type: "response.cancel" });
    }
    // Trim the assistant's last-spoken item down to what was actually heard,
    // so the model's own transcript doesn't include audio that got cut off —
    // otherwise it may reference things it never actually said out loud.
    if (
      options?.audioElapsedMs != null &&
      currentAssistantAudioItemId != null &&
      currentAssistantAudioContentIndex != null
    ) {
      // Floor, never round: rounding up can put audio_end_ms a fraction of a
      // ms past the provider's own reported duration at the boundary
      // (observed: "audio_end_ms 20660 exceeds actual audio duration 20659"),
      // which the provider rejects outright and crashes the session.
      const audioEndMs = Math.max(0, Math.floor(options.audioElapsedMs));
      devLog.flat("TURN", "OUT conversation.item.truncate (interrupt)", {
        reason,
        itemId: currentAssistantAudioItemId,
        audioEndMs,
      });
      send({
        type: "conversation.item.truncate",
        item_id: currentAssistantAudioItemId,
        content_index: currentAssistantAudioContentIndex,
        audio_end_ms: audioEndMs,
      });
    }
    devLog.flat("TURN", "OUT output_audio_buffer.clear (interrupt)", { reason });
    send({ type: "output_audio_buffer.clear" });
    // Leave the current caption on screen, same as real voice interruption:
    // it's cleared naturally when the new response starts (onResponseStarted).
    sendUserMessage(userText);
    if (!sessionReady) {
      pendingDeferredResponse = true;
      return;
    }
    sendResponseCreate(reason);
  };

  const trySendJson = (payload: unknown) => {
    try {
      send(payload);
    } catch (e) {
      devLog.event("ERROR", "realtime send failed", summarizeLogPayload({
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  };

  const configureSession = (
    session: RealtimeSessionConfig,
    options?: ConfigureSessionOptions
  ): void => {
    sessionReady = false;
    pendingDeferredResponse = false;
    pendingCreateEventId = null;
    pendingCreateReason = null;
    createRejectedRetries = 0;
    if (options?.triggerGreetingOnReady) {
      pendingOpeningGreeting = options.greetingUserText ?? DEFAULT_GREETING_USER_TEXT;
    } else {
      pendingOpeningGreeting = null;
    }
    greetingHeld = options?.holdGreeting ?? false;
    devLog.event("REALTIME", "OUT session.update", summarizeLogPayload({
      model: session.model,
      toolCount: session.tools?.length ?? 0,
      toolNames: session.tools?.map((tool) => tool.name),
      instructionsPreview: session.instructions,
      triggerGreetingOnReady: options?.triggerGreetingOnReady ?? false,
    }));
    trySendJson({ type: "session.update", session });
  };
  
  const sendUserMessage = (text: string): void => {
    devLog.event("REALTIME", "OUT user message", summarizeLogPayload({ text }));
    trySendJson({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  };

  /**
   * Re-request a response for a user turn that produced nothing.
   *
   * A bare `response.create` against the same context also comes back empty
   * (confirmed via logs): the model won't act on a conversation whose last turn
   * is the committed *audio* turn. Injecting a *text* user item makes it
   * respond, so we echo the visitor's transcript.
   */
  const recoverTurn = (createReason: string): void => {
    const recoveryText = lastUserTranscript.trim()
      ? `The visitor said: "${lastUserTranscript.trim()}". Respond now and continue.`
      : "The visitor responded. Respond now and continue.";
    sendUserMessage(recoveryText);
    sendResponseCreate(createReason);
  };

  /**
   * Send the queued greeting, unless it is being held back until the page can
   * actually be heard. Held greetings stay queued; everything else keeps the
   * original semantics, including dropping the greeting if a response somehow
   * beat it to the session.
   */
  const flushOpeningGreeting = (): void => {
    if (pendingOpeningGreeting == null || !sessionReady || greetingHeld) return;
    const userText = pendingOpeningGreeting;
    pendingOpeningGreeting = null;
    if (activeResponses !== 0) return;
    trySendJson({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: userText }],
      },
    });
    sendResponseCreate("greeting");
  };

  /** Release (or re-hold) a queued greeting; releasing sends it if it is due. */
  const setGreetingHeld = (held: boolean): void => {
    if (greetingHeld === held) return;
    greetingHeld = held;
    devLog.event("REALTIME", held ? "greeting held" : "greeting released");
    if (!held) flushOpeningGreeting();
  };

  const handleEvent = async (event: unknown): Promise<boolean> => {
    const obj = asObj(event);
    if (!obj) return false;
    const type = asStr(obj.type);
    if (!type) return false;

    if (type === "session.updated") {
      sessionReady = true;
      devLog.event("REALTIME", "IN session.updated");
      callbacks.onSessionReady?.();
      if (pendingOpeningGreeting != null) {
        flushOpeningGreeting();
      } else if (pendingDeferredResponse && activeResponses === 0) {
        pendingDeferredResponse = false;
        sendResponseCreate("deferred-on-session-updated");
      }
      return true;
    }

    if (type === "response.created") {
      activeResponses += 1;
      sawOutputThisResponse = false;
      currentResponseReason = pendingCreateReason ?? "server-auto";
      pendingCreateReason = null;
      pendingCreateEventId = null;
      currentAssistantAudioItemId = null;
      currentAssistantAudioContentIndex = null;
      devLog.flat("TURN", "IN response.created", {
        reason: currentResponseReason,
        forUserTranscript: lastUserTranscript,
        activeResponses,
      });
      callbacks.onResponseStarted?.();
      return true;
    }

    if (type === "response.done") {
      activeResponses = Math.max(0, activeResponses - 1);
      const r = obj.response as { status?: string; status_details?: unknown } | undefined;
      if (r?.status === "failed") {
        devLog.event("ERROR", "response.failed", r.status_details);
      }
      const rFull = obj.response as
        | { status?: string; usage?: unknown; output?: unknown[] }
        | undefined;
      devLog.flat("TURN", "IN response.done", {
        reason: currentResponseReason,
        status: r?.status,
        sawOutput: sawOutputThisResponse,
        forUserTranscript: lastUserTranscript,
        usage: rFull?.usage ?? null,
        outputLen: Array.isArray(rFull?.output) ? rFull.output.length : null,
        activeResponses,
      });
      callbacks.onResponseDone?.({ status: r?.status });
      if (pendingDeferredResponse && sessionReady && activeResponses === 0) {
        pendingDeferredResponse = false;
        sendResponseCreate("deferred-on-response-done");
        return true;
      }

      // Empty-response recovery: a completed response that produced no output.
      const wasEmpty =
        r?.status !== "cancelled" &&
        r?.status !== "failed" &&
        !sawOutputThisResponse;
      if (wasEmpty) {
        if (
          sessionReady &&
          activeResponses === 0 &&
          emptyResponseRetries < MAX_EMPTY_RESPONSE_RETRIES
        ) {
          emptyResponseRetries += 1;
          devLog.event("REALTIME", "empty response recovery — re-requesting", {
            status: r?.status,
            emptyResponseRetries,
          });
          devLog.flat("TURN", "EMPTY RESPONSE — recovering via injected text", {
            createdBy: currentResponseReason,
          });
          recoverTurn("empty-retry");
        } else {
          devLog.flat("TURN", "EMPTY RESPONSE — no retry (cap/guards)", {
            createdBy: currentResponseReason,
            status: r?.status,
            emptyResponseRetries,
          });
        }
      } else {
        emptyResponseRetries = 0;
      }
      return true;
    }

    if (type === "response.output_item.added") {
      sawOutputThisResponse = true;
      const item = (obj as { item?: { type?: string; id?: string; call_id?: string; name?: string } }).item;
      if (item?.type === "function_call" && item.id) {
        functionCallMeta.set(item.id, { call_id: item.call_id, name: item.name });
      }
      return true;
    }

    if (type === "response.content_part.added") {
      sawOutputThisResponse = true;
      const part = asObj(obj.part);
      if (asStr(part?.type) === "audio") {
        const itemId = asStr(obj.item_id);
        const contentIndex = (obj as Record<string, unknown>).content_index;
        if (itemId) currentAssistantAudioItemId = itemId;
        if (typeof contentIndex === "number") currentAssistantAudioContentIndex = contentIndex;
        callbacks.onAudioPartReady?.();
      }
      return true;
    }

    if (type === "response.function_call_arguments.done") {
      const itemId = asStr(obj.item_id);
      const argsStr = asStr(obj.arguments);
      if (!itemId || argsStr == null) return true;
      sawOutputThisResponse = true;
      const meta = functionCallMeta.get(itemId);
      const name = meta?.name;
      const callId = meta?.call_id ?? itemId;
      devLog.flat("TURN", "tool call emitted", { name, createdBy: currentResponseReason });
      if (!name) return true;

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(argsStr);
      } catch {
        parsedArgs = {};
      }

      const handler = getCtx().toolHandlers[name];
      devLog.event("AGENT", `tool ${name}`, summarizeLogPayload({ args: parsedArgs }));
      let result: ToolResult;
      if (!handler) {
        result = { ok: false, error: `No handler for tool: ${name}` };
      } else {
        try {
          result = await Promise.resolve(handler(parsedArgs));
        } catch (err) {
          // A throwing handler must still produce a function_call_output.
          // Without one the model waits forever for a result that will never
          // arrive and the agent goes silent mid-conversation — on a museum
          // kiosk that reads as a hang. Hand the model the failure instead so
          // it can acknowledge it and carry on.
          const detail = err instanceof Error && err.message ? err.message : String(err);
          devLog.event("ERROR", `tool ${name} threw`, summarizeLogPayload({ error: detail }));
          result = { ok: false, error: `Tool ${name} failed: ${detail}` };
        }
      }
      devLog.event("AGENT", `tool ${name} result`, summarizeLogPayload(result));

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
      if (result.ok && result.suppressContinuation) {
        cancelActiveResponse();
        devLog.flat("TURN", "skip response.create: tool requested suppressContinuation", { name });
      } else {
        requestResponseIfIdle("tool-continuation");
      }
      functionCallMeta.delete(itemId);
      return true;
    }

    if (type === "response.output_audio.delta") {
      sawOutputThisResponse = true;
      const contentIndex = (obj as Record<string, unknown>).content_index;
      const timestampInfo = asObj((obj as Record<string, unknown>).timestamp_info);
      const wordAlignment = asObj(timestampInfo?.word_alignment);
      if (wordAlignment) {
        const words = Array.isArray(wordAlignment.words) ? (wordAlignment.words as string[]) : [];
        const starts = Array.isArray(wordAlignment.word_start_time_seconds)
          ? (wordAlignment.word_start_time_seconds as number[])
          : [];
        const ends = Array.isArray(wordAlignment.word_end_time_seconds)
          ? (wordAlignment.word_end_time_seconds as number[])
          : [];
        callbacks.onWordAlignment?.(
          typeof contentIndex === "number" ? contentIndex : 0,
          words.map((w, i) => ({ w, s: starts[i] ?? 0, e: ends[i] ?? 0 }))
        );
      }
      return true;
    }

    if (type === "response.output_audio_transcript.delta") {
      sawOutputThisResponse = true;
      return true;
    }

    if (type === "response.output_audio_transcript.done") {
      return true;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      // New user turn — reset the turn-recovery retry budgets.
      emptyResponseRetries = 0;
      createRejectedRetries = 0;
      const transcript = asStr(obj.transcript);
      lastUserTranscript = transcript ?? "";
      devLog.flat("TURN", "IN transcription.completed", {
        transcript: transcript ?? "(null)",
        length: transcript?.length ?? 0,
        blank: !transcript || transcript.trim().length === 0,
      });
      if (transcript && transcript.trim().length > 0) {
        callbacks.onUserTranscript(transcript);
        callbacks.onCaption(null);
      }
      return true;
    }

    if (type === "error") {
      devLog.event("ERROR", "realtime event error", summarizeLogPayload(obj));
      const errRaw = obj.error;
      let message = "Realtime agent error";
      if (errRaw && typeof errRaw === "object") {
        const e = errRaw as Record<string, unknown>;
        const msg = asStr(e.message);
        const code = asStr(e.code);
        const param = asStr(e.param);
        const errType = asStr(e.type);
        const parts: string[] = [];
        if (msg) parts.push(msg);
        if (code) parts.push(`code=${code}`);
        if (param) parts.push(`param=${param}`);
        if (errType) parts.push(`type=${errType}`);
        if (parts.length > 0) message = parts.join(" | ");
      } else if (typeof errRaw === "string") {
        message = errRaw;
      }

      // A rejected `response.create` produces neither `response.created` nor
      // `response.done`, so the empty-response recovery above never runs and
      // the visitor's turn ends in silence with no retry. Correlate the error
      // back to the create we're waiting on and re-request once per turn.
      if (pendingCreateEventId != null && isResponseCreateRejection(errRaw, pendingCreateEventId)) {
        const rejectedReason = pendingCreateReason;
        pendingCreateEventId = null;
        pendingCreateReason = null;
        if (
          sessionReady &&
          activeResponses === 0 &&
          createRejectedRetries < MAX_CREATE_REJECTED_RETRIES
        ) {
          createRejectedRetries += 1;
          devLog.flat("TURN", "response.create REJECTED — recovering via injected text", {
            rejectedReason,
            message,
            createRejectedRetries,
          });
          recoverTurn("create-rejected-retry");
        } else {
          devLog.flat("TURN", "response.create REJECTED — no retry (cap/guards)", {
            rejectedReason,
            message,
            createRejectedRetries,
            sessionReady,
            activeResponses,
          });
        }
      }

      callbacks.onError(message);
      return true;
    }

    // Speech VAD events: useful for diagnostics but not actionable here.
    if (type === "input_audio_buffer.speech_started") {
      return true;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      return true;
    }

    if (type.startsWith("output_audio_buffer.")) {
      devLog.event("REALTIME", `IN ${type}`, summarizeLogPayload(obj));
      return true;
    }

    return false;
  };

  return {
    handleEvent,
    requestResponseIfIdle,
    isResponseActive,
    configureSession,
    setGreetingHeld,
    sendUserMessage,
    cancelActiveResponse,
    interruptAndRespond,
  };
}
