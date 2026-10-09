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
  /** Reported error (e.g. session-level error). Tears the session down and reconnects. */
  onError: (message: string) => void;
  /**
   * A provider error the loop absorbed: the session keeps running. Reported
   * for monitoring only — nothing downstream needs to act on it.
   */
  onNonFatalError?: (info: {
    message: string;
    code: string | null;
    handling: "ignored" | "recovered";
    /** The provider was at capacity — reported separately from real faults. */
    capacity: boolean;
  }) => void;
  /** Fired when the server confirms the session config was applied. */
  onSessionReady?: () => void;
  /** Fired when an assistant response begins, before audio is audible. */
  onResponseStarted?: (info?: { responseId?: string }) => void;
  /** Fired when an assistant response completes (`response.done`). */
  onResponseDone?: (info?: { status?: string; usage?: unknown; responseId?: string }) => void;
  /**
   * The agent's audio is being cut off: this client cleared the output buffer
   * for a barge-in, or the visitor started speaking into a session whose
   * turn detection interrupts the agent. Word alignment runs ahead of the
   * audio, so whatever it describes past this point will not be heard.
   */
  onOutputInterrupted?: (reason: string) => void;
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

/**
 * Sent when the talk button cut the agent off but the visitor then said nothing:
 * the agent picks up again instead of waiting in silence for the idle nudge.
 */
const RESUME_AFTER_EMPTY_PRESS_TEXT =
  "(The visitor pressed the talk button, which cut you off, but said nothing. Pick up briefly where you were cut off — do not start over.)";

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
  /**
   * Push-to-talk press: the visitor's turn starts. Discards whatever the input
   * buffer held from before, and — when `interrupt` is given — cuts the agent
   * off first, the way a voice barge-in used to. A press that lands within the
   * commit delay of the last release continues that turn instead.
   */
  beginUserTurn: (options?: { interrupt?: { audioElapsedMs?: number } }) => void;
  /**
   * Push-to-talk release: the turn is over. After {@link PTT_COMMIT_DELAY_MS},
   * so the last audio still on its way is in, commits the input buffer and asks
   * for the reply. `respond: false` throws the turn away instead (the agent was
   * dismissed, not answered). A no-op when no turn is open.
   */
  endUserTurn: (options?: { respond?: boolean }) => void;
};

/**
 * How long after the talk button is released the turn is committed. The audio
 * travels over RTP and the commit over the data channel, so committing at once
 * would race the last few hundred ms of speech.
 */
export const PTT_COMMIT_DELAY_MS = 300;

/** How long a released turn waits for its transcript before deciding without it. */
export const PTT_TRANSCRIPT_TIMEOUT_MS = 3_000;

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

/**
 * Provider errors that reject a client event which no longer applies, leaving
 * the session itself intact and nothing to recover.
 *
 * Default is the opposite: an unrecognised error still tears the session down
 * and reconnects. That matters because most `invalid_request_error`s are *not*
 * harmless — a rejected `session.update` means `session.updated` never arrives,
 * so `sessionReady` stays false and the agent goes silent forever; a rejected
 * `conversation.item.create` for a `function_call_output` leaves the model
 * waiting on a result that will never come. Reconnecting is a blunt but real
 * recovery for those. Only codes that are provably no-ops belong here.
 */
const BENIGN_ERROR_CODES = new Set([
  // Barge-in raced the end of a response: the server had already closed it by
  // the time our `response.cancel` landed. The cancel was a no-op and the
  // `output_audio_buffer.clear` that follows still stops the audio.
  "response_cancel_not_active",
  // A commit with nothing buffered — the visitor's turn produced no audio.
  "input_audio_buffer_commit_empty",
  // A barge-in truncate that named a point past the audio the server actually
  // synthesised. The offset is an estimate and the cancel we send alongside is
  // itself what decides the real duration, so it cannot be made exact — see
  // `interruptAndRespond` in useRealtimeVoiceSession. The cost of the failure
  // is that the model's transcript keeps a few words the visitor never heard.
  "audio_end_ms_out_of_range",
]);

/**
 * The error's `code`, as a string. Numbers are stringified: capacity failures
 * arrive as the gRPC status `8` (a number), and reading it as a string only
 * would drop the one signal that says "busy" rather than "broken".
 */
function errorCode(errRaw: unknown): string | null {
  const code = asObj(errRaw)?.code;
  if (typeof code === "number") return String(code);
  return asStr(code);
}

/**
 * gRPC `RESOURCE_EXHAUSTED` — the account is at its concurrency limit and the
 * provider refused this generation. Matched on the message too, because the
 * code does not always survive the trip through the realtime transport.
 */
const CAPACITY_ERROR_CODES = new Set(["8", "resource_exhausted", "rate_limit_exceeded"]);
const CAPACITY_MESSAGE_PATTERN = /resource[ _]?exhausted|maximum allowed number of active/i;

/**
 * Did the provider refuse this because the account is busy rather than broken?
 *
 * Worth its own answer: every other unrecognised error tears the session down
 * and reconnects, which is the one response that cannot help here — the
 * session itself is healthy, and asking for a new one while every slot is
 * taken is how a passing squeeze becomes a dead agent for the visitor.
 */
function isCapacityRealtimeError(errRaw: unknown): boolean {
  const code = errorCode(errRaw)?.toLowerCase();
  if (code && CAPACITY_ERROR_CODES.has(code)) return true;
  const message = asStr(asObj(errRaw)?.message) ?? "";
  return CAPACITY_MESSAGE_PATTERN.test(message);
}

function isBenignRealtimeError(errRaw: unknown): boolean {
  const code = errorCode(errRaw);
  return code != null && BENIGN_ERROR_CODES.has(code);
}

/** Did this error come back from a `response.cancel` that had nothing to cancel? */
function isStaleCancelError(errRaw: unknown): boolean {
  return errorCode(errRaw) === "response_cancel_not_active";
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
  /**
   * Turns re-requested after a capacity refusal, for the current user turn.
   *
   * Unlike the other recoveries this one waits before retrying: an immediate
   * `response.create` asks for a slot that is, by definition, still taken.
   */
  let capacityRetries = 0;
  const MAX_CAPACITY_RETRIES = 2;
  const CAPACITY_RETRY_DELAY_MS = 4_000;
  let capacityRetryTimer: ReturnType<typeof setTimeout> | null = null;
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
  /**
   * What the current response streamed, for its one-line summary on `response.done`.
   * Deltas arrive dozens per second, so they are counted rather than logged.
   */
  let streamed = { audioDeltas: 0, words: 0, transcriptDeltas: 0, other: {} as Record<string, number> };
  /**
   * True between sending a `response.cancel` and the next response event.
   *
   * `activeResponses` only predicts the server's state: the server closes a
   * response as soon as generation and TTS finish, while the client is still
   * playing that audio out for many seconds. Rapid interrupts in that window
   * would each send another `response.cancel` at a response that is already
   * gone. One cancel per response is all the server can act on.
   */
  let cancelInFlight = false;
  /**
   * Whether the configured turn detection cuts the agent off when the visitor
   * starts speaking. The Realtime API defaults `interrupt_response` to true.
   */
  let speechInterruptsResponse = false;
  /** Push-to-talk: the visitor holds (or latched) the talk button. */
  let userTurnOpen = false;
  /** Push-to-talk: a released turn waiting out {@link PTT_COMMIT_DELAY_MS}. */
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Push-to-talk: words were transcribed since the button went down. Only a
   * turn with words is answered — the model would otherwise reply to an empty
   * turn every time someone brushes the button. The transcript, not
   * `speech_started`, is the signal: Inworld can leave a turn open from before
   * the press, and speech landing in it never announces itself.
   */
  let turnHasWords = false;
  /**
   * A tool result went back while the reply that called the tool was still
   * running: the follow-up reply is owed, and asked for once that reply is done.
   * Inworld's own follow-up (`auto_tool_response`) is off — it started the
   * moment the result landed and cancelled whatever the reply was still saying.
   */
  let toolFollowUpOwed = false;
  /** Push-to-talk: this turn's press cut the agent off mid-reply. */
  let turnCutAgent = false;
  /**
   * Push-to-talk: the released turn's commit, waiting for its transcript before
   * deciding whether to answer. `"sent"` until the provider names the item.
   */
  let awaitingTurn: "sent" | { itemId: string } | null = null;
  let awaitingTurnTimer: ReturnType<typeof setTimeout> | null = null;

  /** Send `response.cancel` unless one is already outstanding. */
  const sendCancelIfPossible = (logLabel: string, fields: object = {}): void => {
    if (activeResponses === 0) return;
    if (cancelInFlight) {
      devLog.flat("TURN", "skip response.cancel: already cancelling", fields);
      return;
    }
    cancelInFlight = true;
    devLog.flat("TURN", logLabel, fields);
    send({ type: "response.cancel" });
  };

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
    // Whoever cancels takes over; a follow-up to the cancelled reply is not wanted.
    toolFollowUpOwed = false;
    sendCancelIfPossible("OUT response.cancel");
    callbacks.onCaption(null);
  };

  /**
   * Cut the agent off: cancel any in-flight response, trim its last-spoken
   * item to what was heard (if known), and clear the audio still buffered.
   */
  const cutOutput = (reason: string, audioElapsedMs?: number): void => {
    // The interruption replaces any follow-up the cut-off reply had owed.
    toolFollowUpOwed = false;
    sendCancelIfPossible("OUT response.cancel (interrupt)", { reason });
    // Trim the assistant's last-spoken item down to what was actually heard,
    // so the model's own transcript doesn't include audio that got cut off —
    // otherwise it may reference things it never actually said out loud.
    if (
      audioElapsedMs != null &&
      currentAssistantAudioItemId != null &&
      currentAssistantAudioContentIndex != null
    ) {
      // Floor, never round: rounding up can put audio_end_ms a fraction of a
      // ms past the provider's own reported duration at the boundary
      // (observed: "audio_end_ms 20660 exceeds actual audio duration 20659").
      // The caller is responsible for the larger question of whether the
      // offset is trustworthy at all; a rejection here is absorbed, not fatal.
      const audioEndMs = Math.max(0, Math.floor(audioElapsedMs));
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
    callbacks.onOutputInterrupted?.(reason);
  };

  const interruptAndRespond = (
    userText: string,
    options?: { reason?: string; audioElapsedMs?: number }
  ): void => {
    const reason = options?.reason ?? "interrupt-request";
    cutOutput(reason, options?.audioElapsedMs);
    // Leave the current caption on screen, same as real voice interruption:
    // it's cleared naturally when the new response starts (onResponseStarted).
    sendUserMessage(userText);
    if (!sessionReady) {
      pendingDeferredResponse = true;
      return;
    }
    sendResponseCreate(reason);
  };

  const isAwaitedItem = (itemId: unknown): boolean =>
    awaitingTurn != null && awaitingTurn !== "sent" && awaitingTurn.itemId === itemId;

  /**
   * The released turn's transcript is in (or will not come): answer it if the
   * visitor said anything, otherwise let it go.
   */
  const finishUserTurn = (why: string): void => {
    if (awaitingTurnTimer != null) clearTimeout(awaitingTurnTimer);
    awaitingTurnTimer = null;
    awaitingTurn = null;
    if (!turnHasWords) {
      devLog.flat("TURN", "push-to-talk turn had no words — not answered", { why, turnCutAgent });
      trySendJson({ type: "input_audio_buffer.clear" });
      // The press silenced the agent for nothing: let it carry on.
      if (turnCutAgent && sessionReady && activeResponses === 0) {
        sendUserMessage(RESUME_AFTER_EMPTY_PRESS_TEXT);
        sendResponseCreate("push-to-talk-resume");
      }
      return;
    }
    if (!sessionReady || activeResponses > 0) {
      // Answered once the session is configured, or once what is playing ends.
      devLog.flat("TURN", "push-to-talk reply deferred", { why, sessionReady, activeResponses });
      pendingDeferredResponse = true;
      return;
    }
    sendResponseCreate("push-to-talk");
  };

  const beginUserTurn = (options?: { interrupt?: { audioElapsedMs?: number } }): void => {
    if (awaitingTurn != null) {
      // Pressed again while the last turn's transcript was still coming: it all
      // becomes one turn, answered when this one is released.
      if (awaitingTurnTimer != null) clearTimeout(awaitingTurnTimer);
      awaitingTurnTimer = null;
      awaitingTurn = null;
      userTurnOpen = true;
      devLog.flat("TURN", "push-to-talk re-pressed before the reply — same turn");
      return;
    }
    if (commitTimer != null) {
      // Pressed again before the last release was committed: one turn, not two.
      clearTimeout(commitTimer);
      commitTimer = null;
      userTurnOpen = true;
      devLog.flat("TURN", "push-to-talk re-pressed before commit — same turn");
      return;
    }
    userTurnOpen = true;
    turnHasWords = false;
    // The visitor's turn takes over from any follow-up still owed.
    toolFollowUpOwed = false;
    turnCutAgent = options?.interrupt != null;
    // A new turn from the visitor: the recovery budgets are theirs again.
    emptyResponseRetries = 0;
    createRejectedRetries = 0;
    capacityRetries = 0;
    if (options?.interrupt) cutOutput("push-to-talk", options.interrupt.audioElapsedMs);
    devLog.flat("TURN", "OUT input_audio_buffer.clear (push-to-talk press)");
    trySendJson({ type: "input_audio_buffer.clear" });
  };

  const endUserTurn = (options?: { respond?: boolean }): void => {
    if (!userTurnOpen) return;
    userTurnOpen = false;
    if (options?.respond === false) {
      devLog.flat("TURN", "OUT input_audio_buffer.clear (push-to-talk discarded)");
      trySendJson({ type: "input_audio_buffer.clear" });
      return;
    }
    commitTimer = setTimeout(() => {
      commitTimer = null;
      devLog.flat("TURN", "OUT input_audio_buffer.commit (push-to-talk release)");
      trySendJson({ type: "input_audio_buffer.commit" });
      awaitingTurn = "sent";
      // A transcript that never comes (observed: stt_timeout after ~1 s) must
      // not leave the turn hanging.
      awaitingTurnTimer = setTimeout(() => finishUserTurn("transcript-timeout"), PTT_TRANSCRIPT_TIMEOUT_MS);
    }, PTT_COMMIT_DELAY_MS);
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
    toolFollowUpOwed = false;
    cancelInFlight = false;
    pendingCreateEventId = null;
    pendingCreateReason = null;
    createRejectedRetries = 0;
    capacityRetries = 0;
    const turnDetection = session.audio.input?.turn_detection;
    speechInterruptsResponse = turnDetection != null && turnDetection.interrupt_response !== false;
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
   * Re-request the turn a capacity refusal killed, after a pause long enough
   * for a slot to free up.
   *
   * Returns whether a retry is now pending. Declines when a response is still
   * in flight (the refusal hit something mid-stream, and `response.done`
   * already has its own empty-response recovery), when one retry is already
   * waiting, or when this turn has used its budget — a visitor talking into a
   * saturated account should hear silence, not an ever-growing queue of
   * retries landing at once.
   *
   * A timer that outlives its connection is harmless: `send` drops anything
   * written to a data channel that is no longer open.
   */
  const scheduleCapacityRecovery = (): boolean => {
    if (capacityRetryTimer != null) return true;
    if (activeResponses > 0 || !sessionReady) return false;
    if (capacityRetries >= MAX_CAPACITY_RETRIES) return false;
    capacityRetries += 1;
    devLog.flat("TURN", "capacity refusal — retrying turn after a pause", {
      capacityRetries,
      delayMs: CAPACITY_RETRY_DELAY_MS,
    });
    capacityRetryTimer = setTimeout(() => {
      capacityRetryTimer = null;
      // The visitor may have spoken again while we waited; their new turn wins.
      if (!sessionReady || activeResponses > 0) return;
      recoverTurn("capacity-retry");
    }, CAPACITY_RETRY_DELAY_MS);
    return true;
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
      cancelInFlight = false;
      sawOutputThisResponse = false;
      currentResponseReason = pendingCreateReason ?? "server-auto";
      pendingCreateReason = null;
      pendingCreateEventId = null;
      currentAssistantAudioItemId = null;
      currentAssistantAudioContentIndex = null;
      streamed = { audioDeltas: 0, words: 0, transcriptDeltas: 0, other: {} };
      devLog.flat("TURN", "IN response.created", {
        reason: currentResponseReason,
        forUserTranscript: lastUserTranscript,
        activeResponses,
      });
      callbacks.onResponseStarted?.({ responseId: asStr(asObj(obj.response)?.id) ?? undefined });
      return true;
    }

    if (type === "response.done") {
      activeResponses = Math.max(0, activeResponses - 1);
      cancelInFlight = false;
      const r = obj.response as { status?: string; status_details?: unknown } | undefined;
      if (r?.status === "failed") {
        devLog.event("ERROR", "response.failed", r.status_details);
      }
      const rFull = obj.response as
        | { id?: string; status?: string; usage?: unknown; output?: unknown[] }
        | undefined;
      devLog.flat("TURN", "IN response.done", {
        reason: currentResponseReason,
        status: r?.status,
        sawOutput: sawOutputThisResponse,
        forUserTranscript: lastUserTranscript,
        usage: rFull?.usage ?? null,
        outputLen: Array.isArray(rFull?.output) ? rFull.output.length : null,
        statusDetails: r?.status_details ?? null,
        audioDeltas: streamed.audioDeltas,
        words: streamed.words,
        transcriptDeltas: streamed.transcriptDeltas,
        otherDeltas: streamed.other,
        activeResponses,
      });
      callbacks.onResponseDone?.({
        status: r?.status,
        usage: rFull?.usage,
        responseId: typeof rFull?.id === "string" ? rFull.id : undefined,
      });
      if (toolFollowUpOwed && activeResponses === 0) {
        toolFollowUpOwed = false;
        // A reply cancelled or failed mid-way is not continued: whatever ended
        // it (a press, a mute) has taken over.
        if (r?.status !== "cancelled" && r?.status !== "failed" && sessionReady) {
          sendResponseCreate("tool-follow-up");
          return true;
        }
      }
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
      devLog.flat("TURN", "IN output_item.added", { itemType: item?.type ?? null, name: item?.name ?? null });
      if (item?.type === "function_call" && item.id) {
        functionCallMeta.set(item.id, { call_id: item.call_id, name: item.name });
      }
      return true;
    }

    if (type === "response.content_part.added") {
      sawOutputThisResponse = true;
      const part = asObj(obj.part);
      devLog.flat("TURN", "IN content_part.added", { partType: asStr(part?.type) });
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
          // installation that reads as a hang. Hand the model the failure instead so
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

      // The model continues from the result in a reply of its own — but only
      // once the reply that made the call has finished, or anything it is still
      // saying would be cut off. Several calls in one reply get one follow-up.
      if (result.ok && result.suppressContinuation) {
        cancelActiveResponse();
        devLog.flat("TURN", "skip response.create: tool requested suppressContinuation", { name });
      } else if (activeResponses > 0) {
        toolFollowUpOwed = true;
        devLog.flat("TURN", "tool follow-up owed — after the current reply", { name });
      } else {
        requestResponseIfIdle("tool-continuation");
      }
      functionCallMeta.delete(itemId);
      return true;
    }

    if (type === "response.output_audio.delta") {
      sawOutputThisResponse = true;
      streamed.audioDeltas += 1;
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
        streamed.words += words.length;
        callbacks.onWordAlignment?.(
          typeof contentIndex === "number" ? contentIndex : 0,
          words.map((w, i) => ({ w, s: starts[i] ?? 0, e: ends[i] ?? 0 }))
        );
      }
      return true;
    }

    if (type === "response.output_audio_transcript.delta") {
      sawOutputThisResponse = true;
      streamed.transcriptDeltas += 1;
      return true;
    }

    if (type === "response.output_audio_transcript.done") {
      // What the agent said, whole — the captions only ever show a sentence of it.
      devLog.flat("TURN", "IN agent said", { transcript: asStr(obj.transcript) ?? "" });
      return true;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      // New user turn — reset the turn-recovery retry budgets.
      emptyResponseRetries = 0;
      createRejectedRetries = 0;
      capacityRetries = 0;
      const transcript = asStr(obj.transcript);
      lastUserTranscript = transcript ?? "";
      const inTurn = userTurnOpen || commitTimer != null || awaitingTurn != null;
      if (inTurn && transcript && transcript.trim().length > 0) turnHasWords = true;
      devLog.flat("TURN", "IN transcription.completed", {
        transcript: transcript ?? "(null)",
        length: transcript?.length ?? 0,
        blank: !transcript || transcript.trim().length === 0,
      });
      if (transcript && transcript.trim().length > 0) {
        callbacks.onUserTranscript(transcript);
        callbacks.onCaption(null);
      }
      if (isAwaitedItem(obj.item_id)) finishUserTurn("transcript");
      return true;
    }

    if (type === "conversation.item.input_audio_transcription.failed") {
      devLog.flat("TURN", "IN transcription.failed", summarizeLogPayload(obj));
      if (isAwaitedItem(obj.item_id)) finishUserTurn("transcript-failed");
      return true;
    }

    if (type === "input_audio_buffer.committed") {
      // The first commit after ours is ours; the provider now names the item.
      if (awaitingTurn === "sent") {
        const itemId = asStr(obj.item_id);
        if (itemId) awaitingTurn = { itemId };
      }
      devLog.flat("TURN", "IN input_audio_buffer.committed", { itemId: asStr(obj.item_id) });
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

      // A stale `response.cancel` (the response already finished server-side)
      // is a no-op, not a session failure. Take the server's word for it: no
      // response is active, so correct our own count rather than leaving it
      // stuck high, which would make `requestResponseIfIdle` refuse forever.
      if (errorCode(errRaw) === "input_audio_buffer_commit_empty" && awaitingTurn === "sent") {
        // Nothing was left to commit — the provider had committed it all itself.
        finishUserTurn("commit-empty");
      }

      if (isStaleCancelError(errRaw)) {
        cancelInFlight = false;
        activeResponses = 0;
      }

      // A rejected `response.create` produces neither `response.created` nor
      // `response.done`, so the empty-response recovery above never runs and
      // the visitor's turn ends in silence with no retry. Correlate the error
      // back to the create we're waiting on and re-request once per turn.
      let escalate = !isBenignRealtimeError(errRaw);
      let handling: "ignored" | "recovered" = "ignored";
      const capacity = isCapacityRealtimeError(errRaw);

      if (capacity) {
        // Never tear down for this one. The session is fine; the account is
        // busy. A reconnect would cost the conversation and then queue for a
        // slot that is already gone — so keep the session and retry the turn.
        if (pendingCreateEventId != null && isResponseCreateRejection(errRaw, pendingCreateEventId)) {
          pendingCreateEventId = null;
          pendingCreateReason = null;
        }
        escalate = false;
        handling = scheduleCapacityRecovery() ? "recovered" : "ignored";
      } else if (pendingCreateEventId != null && isResponseCreateRejection(errRaw, pendingCreateEventId)) {
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
          // The recovery turn is now in flight; reporting the error as fatal
          // here would tear the session down and take that recovery with it.
          escalate = false;
          handling = "recovered";
        } else {
          devLog.flat("TURN", "response.create REJECTED — no retry (cap/guards)", {
            rejectedReason,
            message,
            createRejectedRetries,
            sessionReady,
            activeResponses,
          });
          // Nothing left to try locally: let the session reconnect.
          escalate = true;
        }
      }

      if (!escalate) {
        devLog.flat("TURN", "non-fatal realtime error — session kept", { message, handling, capacity });
        callbacks.onNonFatalError?.({ message, code: errorCode(errRaw), handling, capacity });
        return true;
      }

      callbacks.onError(message);
      return true;
    }

    if (type === "input_audio_buffer.speech_started") {
      devLog.flat("TURN", "IN speech_started", { activeResponses, userTurnOpen });
      if (speechInterruptsResponse) callbacks.onOutputInterrupted?.("speech-started");
      return true;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      devLog.flat("TURN", "IN speech_stopped");
      return true;
    }

    if (type.startsWith("output_audio_buffer.")) {
      devLog.event("REALTIME", `IN ${type}`, summarizeLogPayload(obj));
      return true;
    }

    // Everything else the provider sends is still worth seeing once: a stall can turn out
    // to be an event nobody handles. Streams are counted into the response summary.
    if (type.endsWith(".delta")) {
      streamed.other[type] = (streamed.other[type] ?? 0) + 1;
    } else {
      devLog.flat("REALTIME", `IN ${type}`, summarizeLogPayload(obj));
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
    beginUserTurn,
    endUserTurn,
  };
}
