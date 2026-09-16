import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { councilFetch } from "@/api/http";
import { createRealtimeUsageReporter, USAGE_REPORT_BATCH_SIZE } from "@/realtime/realtimeUsageReporter";

vi.mock("@/api/http", () => ({ councilFetch: vi.fn() }));

const greeting = {
  input_tokens: 3142,
  output_tokens: 131,
  llm: { model: "google-ai-studio/gemini-2.5-flash" },
  tts: { model: "inworld-tts-1.5-max", characters: 261, audio_seconds: 13.6 },
};

function sentBatches(): unknown[][] {
  return vi.mocked(councilFetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)).responses);
}

describe("realtime usage reporter", () => {
  beforeEach(() => {
    vi.mocked(councilFetch).mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends usage in batches against the session's token", () => {
    const reporter = createRealtimeUsageReporter("token-1");

    for (let i = 0; i < USAGE_REPORT_BATCH_SIZE + 1; i++) reporter.report(greeting);

    expect(sentBatches()).toEqual([Array(USAGE_REPORT_BATCH_SIZE).fill(greeting)]);
    const [path, init] = vi.mocked(councilFetch).mock.calls[0];
    expect(path).toBe("/api/usage/realtime");
    expect(JSON.parse(String(init?.body)).usageToken).toBe("token-1");
    expect(init?.keepalive).toBe(true);
    reporter.dispose();
  });

  it.each([
    { name: "session end", end: (reporter: ReturnType<typeof createRealtimeUsageReporter>) => reporter.dispose() },
    { name: "page hide", end: () => window.dispatchEvent(new Event("pagehide")) },
  ])("sends what is queued on $name", ({ end }) => {
    const reporter = createRealtimeUsageReporter("token-1");
    reporter.report(greeting);

    end(reporter);

    expect(sentBatches()).toEqual([[greeting]]);
    reporter.dispose();
  });

  it.each([
    { name: "a cancelled response with no parts", usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 } },
    { name: "a missing usage", usage: undefined },
  ])("skips $name", ({ usage }) => {
    const reporter = createRealtimeUsageReporter("token-1");

    reporter.report(usage);
    reporter.dispose();

    expect(councilFetch).not.toHaveBeenCalled();
  });

  it("reports nothing without a usage token", () => {
    const reporter = createRealtimeUsageReporter(undefined);

    reporter.report(greeting);
    reporter.dispose();

    expect(councilFetch).not.toHaveBeenCalled();
  });

  it("stops listening for page hide once disposed", () => {
    const reporter = createRealtimeUsageReporter("token-1");
    reporter.dispose();
    reporter.report(greeting);

    window.dispatchEvent(new Event("pagehide"));

    expect(councilFetch).not.toHaveBeenCalled();
  });
});
