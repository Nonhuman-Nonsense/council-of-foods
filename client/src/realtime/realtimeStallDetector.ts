/**
 * Notices when a realtime agent has gone quiet when it should not have.
 *
 * It watches the data channel both ways and keeps a short list of things that must be
 * followed by something else within a few seconds — the visitor stopped talking, so a reply
 * should start; a reply started, so it should finish. When the follow-up never comes it
 * reports a stall. It only reports: nothing here changes what the session does, so the
 * reports can be trusted to describe the failure rather than our attempt to fix it.
 *
 * Runs whether or not logging is on — the report goes to ErrorBot either way, and is what
 * says when and where to read the stored log.
 */

export type StallRule =
  /** The visitor stopped speaking and no reply began. */
  | "no-answer"
  /** A reply began and never finished. */
  | "response-unfinished"
  /** A tool result went back and no reply followed it. */
  | "no-tool-continuation"
  /** We asked for a reply; the provider neither started one nor refused. */
  | "create-unanswered"
  /** A reply finished with nothing in it — no audio, no text, no tool call. */
  | "empty-response";

/**
 * Stalls noticed outside the data channel, on the audio side (realtimeAudioMonitor).
 */
export type SessionStallRule =
  | StallRule
  /** A reply carried audio, but none of it reached the page. */
  | "audio-not-received"
  /** A reply carried audio, but the browser is not playing it. */
  | "audio-blocked";

/** How long each follow-up may take. Generous: these are for silence, not slowness. */
export const STALL_TIMEOUTS_MS: Record<Exclude<StallRule, "empty-response">, number> = {
  // Semantic VAD waits out a visitor pausing mid-thought, so a reply can lag the
  // end of speech by a few seconds without anything being wrong.
  "no-answer": 8_000,
  "response-unfinished": 45_000,
  "no-tool-continuation": 6_000,
  "create-unanswered": 8_000,
};

export type StallReport = {
  rule: SessionStallRule;
  /** What the detector knew when it fired: ids, counts, how long it waited. */
  detail: Record<string, unknown>;
};

export type StallDetector = {
  observeIncoming: (event: unknown) => void;
  observeOutgoing: (payload: unknown) => void;
  dispose: () => void;
};

type ResponseCounts = { audioDeltas: number; textDeltas: number; toolCalls: number };

function asObj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function createStallDetector(params: { onStall: (report: StallReport) => void }): StallDetector {
  const { onStall } = params;
  const watches = new Map<string, ReturnType<typeof setTimeout>>();
  const responses = new Map<string, ResponseCounts>();
  /** Deltas that do not name their response belong to the latest one. */
  let latestResponseId = "unknown";
  let disposed = false;

  const watch = (
    key: string,
    rule: Exclude<StallRule, "empty-response">,
    detail: Record<string, unknown> = {},
  ): void => {
    clear(key);
    const waitedMs = STALL_TIMEOUTS_MS[rule];
    watches.set(
      key,
      setTimeout(() => {
        watches.delete(key);
        if (!disposed) onStall({ rule, detail: { ...detail, waitedMs } });
      }, waitedMs),
    );
  };

  function clear(key: string): void {
    const timer = watches.get(key);
    if (timer == null) return;
    clearTimeout(timer);
    watches.delete(key);
  }

  const clearPrefix = (prefix: string): void => {
    for (const key of [...watches.keys()]) {
      if (key.startsWith(prefix)) clear(key);
    }
  };

  const countsFor = (event: Record<string, unknown>): ResponseCounts => {
    const id = asStr(event.response_id) ?? latestResponseId;
    let counts = responses.get(id);
    if (!counts) {
      counts = { audioDeltas: 0, textDeltas: 0, toolCalls: 0 };
      responses.set(id, counts);
    }
    return counts;
  };

  const observeOutgoing = (payload: unknown): void => {
    const obj = asObj(payload);
    const type = asStr(obj?.type);
    if (!obj || !type) return;

    if (type === "response.create") {
      watch("create", "create-unanswered", { eventId: asStr(obj.event_id) });
    } else if (type === "response.cancel") {
      // A cancelled continuation is deliberate (suppressContinuation), not a stall.
      clear("tool");
    } else if (type === "conversation.item.create") {
      const item = asObj(obj.item);
      if (asStr(item?.type) === "function_call_output") {
        watch("tool", "no-tool-continuation", { callId: asStr(item?.call_id) });
      }
    }
  };

  const observeIncoming = (event: unknown): void => {
    const obj = asObj(event);
    const type = asStr(obj?.type);
    if (!obj || !type) return;

    switch (type) {
      case "input_audio_buffer.speech_started":
        // Still talking: the reply waits for them, and the clock with it.
        clear("answer");
        return;
      case "input_audio_buffer.speech_stopped":
        watch("answer", "no-answer");
        return;
      case "conversation.item.input_audio_transcription.completed": {
        // Nothing intelligible was said, so there is nothing to answer.
        const transcript = asStr(obj.transcript);
        if (!transcript || transcript.trim().length === 0) clear("answer");
        return;
      }
      case "response.created": {
        clear("answer");
        clear("create");
        clear("tool");
        const id = asStr(asObj(obj.response)?.id) ?? "unknown";
        latestResponseId = id;
        responses.set(id, { audioDeltas: 0, textDeltas: 0, toolCalls: 0 });
        watch(`response:${id}`, "response-unfinished", { responseId: id });
        return;
      }
      case "error":
        // Refused outright: the event loop's own recovery handles a refusal.
        clear("create");
        return;
      case "response.output_audio.delta":
        countsFor(obj).audioDeltas += 1;
        return;
      case "response.output_audio_transcript.delta":
      case "response.output_text.delta":
        countsFor(obj).textDeltas += 1;
        return;
      case "response.function_call_arguments.done":
        countsFor(obj).toolCalls += 1;
        return;
      case "response.done": {
        const response = asObj(obj.response);
        const id = asStr(response?.id);
        if (id) clear(`response:${id}`);
        else clearPrefix("response:");
        const key = id ?? latestResponseId;
        const counts = responses.get(key) ?? { audioDeltas: 0, textDeltas: 0, toolCalls: 0 };
        responses.delete(key);
        const status = asStr(response?.status);
        if (
          status === "completed" &&
          counts.audioDeltas === 0 &&
          counts.textDeltas === 0 &&
          counts.toolCalls === 0
        ) {
          onStall({
            rule: "empty-response",
            detail: {
              responseId: id,
              outputItems: Array.isArray(response?.output) ? response.output.length : null,
            },
          });
        }
        return;
      }
      default:
        return;
    }
  };

  const dispose = (): void => {
    disposed = true;
    for (const timer of watches.values()) clearTimeout(timer);
    watches.clear();
    responses.clear();
  };

  return { observeIncoming, observeOutgoing, dispose };
}
