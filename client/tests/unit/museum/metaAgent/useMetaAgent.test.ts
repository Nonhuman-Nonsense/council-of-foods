import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMetaAgent } from "@/museum/metaAgent/useMetaAgent";

const mockUseRealtimeVoiceSession = vi.hoisted(() => vi.fn());

vi.mock("@realtime/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: (...args: unknown[]) => mockUseRealtimeVoiceSession(...args),
  getRealtimeRetryPolicy: (critical: boolean) => ({
    maxRetries: critical ? Infinity : 3,
    giveUpSilently: !critical,
  }),
}));

const defaultParams = {
  language: "en",
  liveKey: "live-key",
  instructions: "Be helpful.",
  tools: [],
  toolHandlers: {},
};

const sessionResult = {
  connectionState: "ready" as const,
  lastCaption: null,
  lastUserTranscript: null,
  micStream: null,
  agentSpeaking: false,
  setMicEnabled: vi.fn(),
  sendUserMessage: vi.fn(),
  requestAgentResponse: vi.fn(),
  setAgentOutputMuted: vi.fn(),
  reconfigureSession: vi.fn(),
  hasReceivedAudioPart: false,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRealtimeVoiceSession.mockReturnValue(sessionResult);
});

describe("useMetaAgent", () => {
  it("delegates to useRealtimeVoiceSession with meta-agent feature and live key auth", async () => {
    renderHook(() => useMetaAgent(defaultParams));

    await waitFor(() => {
      expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: "meta-agent",
          language: "en",
          instructions: "Be helpful.",
          authHeaders: { Authorization: "Bearer live-key" },
          triggerGreetingOnReady: false,
          pttMic: true,
          trackAgentSpeaking: true,
        }),
      );
    });
  });
});
