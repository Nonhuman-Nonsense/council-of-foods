import { beforeEach, describe, expect, it, vi } from "vitest";
import { councilFetch } from "@/api/http";
import {
  createMicTimeCounter,
  createRealtimeUsageReporter,
  MIC_TIME_FLUSH_MS,
} from "@/realtime/realtimeUsageReporter";

vi.mock("@/api/http", () => ({ councilFetch: vi.fn() }));

const greeting = {
  input_tokens: 3142,
  output_tokens: 131,
  llm: { model: "google-ai-studio/gemini-2.5-flash" },
  tts: { model: "inworld-tts-1.5-max", characters: 261, audio_seconds: 13.6 },
};

describe("realtime usage reporter", () => {
  beforeEach(() => {
    vi.mocked(councilFetch).mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("sends each response's usage immediately, so the meter moves live", () => {
    const reportUsage = createRealtimeUsageReporter("token-1");

    reportUsage(greeting);

    expect(councilFetch).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(councilFetch).mock.calls[0];
    expect(path).toBe("/api/usage/realtime");
    expect(JSON.parse(String(init?.body))).toEqual({ usageToken: "token-1", usage: greeting });
    expect(init?.keepalive).toBe(true);
  });

  it.each([
    { name: "a cancelled response with no parts", token: "token-1", usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 } },
    { name: "a missing usage", token: "token-1", usage: undefined },
    { name: "usage without a token", token: undefined, usage: greeting },
  ])("skips $name", ({ token, usage }) => {
    createRealtimeUsageReporter(token)(usage);

    expect(councilFetch).not.toHaveBeenCalled();
  });

  it("swallows a failed report", async () => {
    vi.mocked(councilFetch).mockRejectedValue(new TypeError("offline"));

    expect(() => createRealtimeUsageReporter("token-1")(greeting)).not.toThrow();
    await Promise.resolve();
  });
});

describe("speech to text by microphone time", () => {
  const model = "inworld/inworld-stt-1";

  it("reports the time the microphone was open, while open and when it closes", () => {
    vi.useFakeTimers();
    try {
      const report = vi.fn();
      const counter = createMicTimeCounter(report, model);

      counter.open();
      vi.advanceTimersByTime(MIC_TIME_FLUSH_MS);
      counter.open();
      vi.advanceTimersByTime(4_000);
      counter.close();
      counter.close();
      vi.advanceTimersByTime(MIC_TIME_FLUSH_MS);

      expect(report.mock.calls.map(([usage]) => usage)).toEqual([
        { stt: { model, audio_seconds: MIC_TIME_FLUSH_MS / 1000 } },
        { stt: { model, audio_seconds: 4 } },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports nothing for a session that names no transcription model", () => {
    vi.useFakeTimers();
    try {
      const report = vi.fn();
      const counter = createMicTimeCounter(report, "");
      counter.open();
      vi.advanceTimersByTime(5_000);
      counter.close();

      expect(report).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
