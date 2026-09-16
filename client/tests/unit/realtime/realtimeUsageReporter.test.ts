import { beforeEach, describe, expect, it, vi } from "vitest";
import { councilFetch } from "@/api/http";
import { createRealtimeUsageReporter } from "@/realtime/realtimeUsageReporter";

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
    expect(JSON.parse(String(init?.body))).toEqual({ usageToken: "token-1", responses: [greeting] });
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
