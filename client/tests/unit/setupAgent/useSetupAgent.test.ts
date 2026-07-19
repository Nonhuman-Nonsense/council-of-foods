import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSetupAgent } from "@setupAgent/useSetupAgent";

const mockUseRealtimeVoiceSession = vi.hoisted(() => vi.fn());

vi.mock("@realtime/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: (params: unknown) => mockUseRealtimeVoiceSession(params),
  getRealtimeRetryPolicy: (critical: boolean) => ({
    maxRetries: critical ? Infinity : 3,
    giveUpSilently: !critical,
  }),
}));

const baseSession = {
  connectionState: "idle" as const,
  lastCaption: null,
  lastUserTranscript: null,
  hasReceivedAudioPart: false,
  agentSpeaking: false,
  setMicEnabled: vi.fn(),
  sendUserMessage: vi.fn(),
  setAgentOutputMuted: vi.fn(),
};

const defaultParams = {
  language: "en",
  instructions: "Guide the visitor.",
  tools: [],
  toolHandlers: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRealtimeVoiceSession.mockReturnValue(baseSession);
});

describe("useSetupAgent", () => {
  it("wires voice-guide feature with greeting and PTT mic", () => {
    renderHook(() => useSetupAgent(defaultParams));

    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "voice-guide",
        triggerGreetingOnReady: true,
        pttMic: false,
        sessionActive: true,
        autoConnect: true,
      }),
    );
  });

  it("starts muted when initialMuted is true", () => {
    renderHook(() => useSetupAgent({ ...defaultParams, initialMuted: true }));

    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionActive: false,
      }),
    );
  });

  it("reports isConnecting until first audio part", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...baseSession,
      connectionState: "ready",
      hasReceivedAudioPart: false,
    });

    const { result } = renderHook(() => useSetupAgent(defaultParams));
    expect(result.current.isConnecting).toBe(true);

    mockUseRealtimeVoiceSession.mockReturnValue({
      ...baseSession,
      connectionState: "ready",
      hasReceivedAudioPart: true,
    });

    const { result: result2 } = renderHook(() => useSetupAgent(defaultParams));
    await waitFor(() => {
      expect(result2.current.isConnecting).toBe(false);
    });
  });

  it("passes PTT to the shared session and syncs micOpen", () => {
    const setMicEnabled = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...baseSession,
      setMicEnabled,
    });

    const { rerender } = renderHook(
      ({ micOpen }) =>
        useSetupAgent({
          ...defaultParams,
          agentMode: "ptt",
          micOpen,
        }),
      { initialProps: { micOpen: false } },
    );

    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({ pttMic: true }),
    );

    rerender({ micOpen: true });
    expect(setMicEnabled).toHaveBeenCalledWith(true);
  });
});
