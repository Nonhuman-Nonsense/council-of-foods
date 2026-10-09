import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStallDetector,
  STALL_TIMEOUTS_MS,
  type StallReport,
} from "@realtime/realtimeStallDetector";

/** One step of a session: something the provider sent, something we sent, or time passing. */
type Step = { in: Record<string, unknown> } | { out: Record<string, unknown> } | { wait: number };

const created = (id: string): Step => ({ in: { type: "response.created", response: { id } } });
const done = (id: string, status = "completed"): Step => ({ in: { type: "response.done", response: { id, status, output: [] } } });
const audio = (id: string): Step => ({ in: { type: "response.output_audio.delta", response_id: id } });
const toolCall = (id: string): Step => ({ in: { type: "response.function_call_arguments.done", response_id: id, item_id: "i1", arguments: "{}" } });
const toolOutput: Step = { out: { type: "conversation.item.create", item: { type: "function_call_output", call_id: "c1", output: "{}" } } };
const commit: Step = { out: { type: "input_audio_buffer.commit" } };
const clearBuffer: Step = { out: { type: "input_audio_buffer.clear" } };
const wait = (ms: number): Step => ({ wait: ms });

describe("createStallDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function run(steps: Step[]): Promise<StallReport[]> {
    const reports: StallReport[] = [];
    const detector = createStallDetector({ onStall: (report) => reports.push(report) });
    for (const step of steps) {
      if ("in" in step) detector.observeIncoming(step.in);
      else if ("out" in step) detector.observeOutgoing(step.out);
      else await vi.advanceTimersByTimeAsync(step.wait);
    }
    detector.dispose();
    return reports;
  }

  it.each([
    // The visitor's push-to-talk turn.
    { name: "a reply that starts after the turn is sent", steps: [commit, wait(2_000), created("r1"), audio("r1"), done("r1")], stall: null },
    { name: "no reply after the turn is sent", steps: [commit, wait(STALL_TIMEOUTS_MS["no-answer"])], stall: "no-answer" },
    { name: "a new press after the turn is sent", steps: [commit, wait(3_000), clearBuffer, wait(STALL_TIMEOUTS_MS["no-answer"])], stall: null },
    // A reply in progress.
    { name: "a reply that never finishes", steps: [created("r1"), audio("r1"), wait(STALL_TIMEOUTS_MS["response-unfinished"])], stall: "response-unfinished" },
    { name: "a reply with nothing in it", steps: [created("r1"), done("r1")], stall: "empty-response" },
    { name: "a cancelled reply with nothing in it", steps: [created("r1"), done("r1", "cancelled")], stall: null },
    { name: "a reply that only calls a tool", steps: [created("r1"), toolCall("r1"), done("r1")], stall: null },
    // A tool result, which the provider follows with a reply of its own.
    { name: "a tool result followed by a reply", steps: [created("r1"), toolCall("r1"), toolOutput, done("r1"), wait(1_000), created("r2")], stall: null },
    { name: "a tool result followed by nothing", steps: [created("r1"), toolCall("r1"), toolOutput, done("r1"), wait(STALL_TIMEOUTS_MS["no-tool-continuation"])], stall: "no-tool-continuation" },
    { name: "a tool result whose continuation we cancelled", steps: [toolOutput, { out: { type: "response.cancel" } }, wait(STALL_TIMEOUTS_MS["no-tool-continuation"])], stall: null },
    // A reply we asked for.
    { name: "a requested reply that starts", steps: [{ out: { type: "response.create", event_id: "e1" } }, created("r1"), audio("r1"), done("r1")], stall: null },
    { name: "a requested reply the provider refuses", steps: [{ out: { type: "response.create", event_id: "e1" } }, { in: { type: "error", error: { event_id: "e1" } } }, wait(STALL_TIMEOUTS_MS["create-unanswered"])], stall: null },
    { name: "a requested reply that never comes", steps: [{ out: { type: "response.create", event_id: "e1" } }, wait(STALL_TIMEOUTS_MS["create-unanswered"])], stall: "create-unanswered" },
  ])("$name → $stall", async ({ steps, stall }) => {
    const reports = await run(steps as Step[]);

    expect(reports.map((report) => report.rule)).toEqual(stall ? [stall] : []);
  });

  it("goes quiet once disposed, so a closed session reports nothing", async () => {
    const reports: StallReport[] = [];
    const detector = createStallDetector({ onStall: (report) => reports.push(report) });
    detector.observeOutgoing({ type: "input_audio_buffer.commit" });

    detector.dispose();
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUTS_MS["no-answer"]);

    expect(reports).toEqual([]);
  });
});
