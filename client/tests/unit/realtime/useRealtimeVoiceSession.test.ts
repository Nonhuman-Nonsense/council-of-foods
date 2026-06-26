import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";

const mockCreateEventLoop = vi.hoisted(() => vi.fn());
const mockCreateCaptionScheduler = vi.hoisted(() => vi.fn());
const mockFetchRealtimeBootstrap = vi.hoisted(() => vi.fn());
const mockCreateRealtimeConnection = vi.hoisted(() => vi.fn());

let eventLoopCallbacks: {
  onCaption?: (text: string | null) => void;
  onUserTranscript?: (text: string) => void;
  onAudioPartReady?: () => void;
  onResponseStarted?: () => void;
  onResponseDone?: () => void;
} = {};

const schedulerMocks = vi.hoisted(() => ({
  setAudioAnchor: vi.fn(),
  finalize: vi.fn(),
}));

const eventLoopMocks = vi.hoisted(() => ({
  configureSession: vi.fn(),
  handleEvent: vi.fn(),
  sendUserMessage: vi.fn(),
  cancelActiveResponse: vi.fn(),
  requestResponseIfIdle: vi.fn(),
  isResponseActive: vi.fn(() => false),
}));

vi.mock("@voice/realtimeEventLoop", () => ({
  createEventLoop: (params: {
    callbacks: typeof eventLoopCallbacks;
    captionScheduler: unknown;
  }) => {
    eventLoopCallbacks = params.callbacks;
    mockCreateEventLoop(params);
    return eventLoopMocks;
  },
}));

vi.mock("@voice/captionScheduler", () => ({
  createCaptionScheduler: (options: { onCaption: (text: string | null) => void }) => {
    const scheduler = {
      beginResponse: vi.fn(),
      appendDelta: vi.fn(),
      finalize: schedulerMocks.finalize,
      setAudioAnchor: schedulerMocks.setAudioAnchor,
      cancel: vi.fn(),
      setSpeed: vi.fn(),
    };
    mockCreateCaptionScheduler(options);
    return scheduler;
  },
}));

vi.mock("@realtime/realtimeConnection", () => ({
  fetchRealtimeBootstrap: (...args: unknown[]) => mockFetchRealtimeBootstrap(...args),
  createRealtimeConnection: (...args: unknown[]) => mockCreateRealtimeConnection(...args),
}));

const defaultParams = {
  feature: "meta-agent" as const,
  language: "en",
  instructions: "Be helpful.",
  tools: [],
  toolHandlers: {},
  triggerGreetingOnReady: false,
  authHeaders: { Authorization: "Bearer live-key" },
  pttMic: true,
  trackAgentSpeaking: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  eventLoopCallbacks = {};
  schedulerMocks.setAudioAnchor.mockClear();

  mockFetchRealtimeBootstrap.mockResolvedValue({
    provider: "inworld",
    session: { audio: { output: { speed: 1 } } },
    iceServers: [],
  });

  mockCreateRealtimeConnection.mockImplementation(async ({ onOpen }: { onOpen: () => void }) => {
    onOpen();
    return {
      close: vi.fn(),
      micStream: {
        getTracks: () => [{ stop: vi.fn() }],
        getAudioTracks: () => [{ enabled: false }],
      },
      dc: { readyState: "open", send: vi.fn() },
    };
  });

  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getAudioTracks: () => [{ enabled: false }],
      }),
    },
  });
});

describe("useRealtimeVoiceSession", () => {
  it("bootstraps with feature and auth headers", async () => {
    renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockFetchRealtimeBootstrap).toHaveBeenCalledWith(
        { feature: "meta-agent", language: "en" },
        expect.any(Function),
        expect.any(AbortSignal),
        { Authorization: "Bearer live-key" },
      );
    });
  });

  it("wires caption scheduler and user transcript callbacks", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateCaptionScheduler).toHaveBeenCalled();
      expect(mockCreateEventLoop).toHaveBeenCalledWith(
        expect.objectContaining({ captionScheduler: expect.any(Object) }),
      );
    });

    act(() => {
      eventLoopCallbacks.onUserTranscript?.("What is happening?");
    });
    expect(result.current.lastUserTranscript).toBe("What is happening?");

    act(() => {
      eventLoopCallbacks.onCaption?.("The council is discussing forests.");
    });
    expect(result.current.lastCaption).toBe("The council is discussing forests.");
  });

  it("toggles agentSpeaking when trackAgentSpeaking is enabled", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.agentSpeaking).toBe(true);

    act(() => {
      eventLoopCallbacks.onResponseDone?.();
    });
    expect(result.current.agentSpeaking).toBe(false);
  });

  it("does not toggle agentSpeaking when trackAgentSpeaking is false", async () => {
    const { result } = renderHook(() =>
      useRealtimeVoiceSession({ ...defaultParams, trackAgentSpeaking: false }),
    );

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.agentSpeaking).toBe(false);
  });

  it("sets hasReceivedAudioPart on first agent audio", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onAudioPartReady?.();
    });
    expect(result.current.hasReceivedAudioPart).toBe(true);
  });

  it("does not connect when sessionActive is false", async () => {
    renderHook(() => useRealtimeVoiceSession({ ...defaultParams, sessionActive: false }));

    await waitFor(() => {
      expect(mockFetchRealtimeBootstrap).not.toHaveBeenCalled();
    });
  });

  it("clears captions when agent output is muted", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onUserTranscript?.("Hello");
      eventLoopCallbacks.onCaption?.("Hi there");
    });

    act(() => {
      result.current.setAgentOutputMuted(true);
    });

    expect(result.current.lastCaption).toBeNull();
    expect(result.current.lastUserTranscript).toBeNull();
  });

  it("requestAgentResponse delegates to the event loop", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      result.current.requestAgentResponse();
    });

    expect(eventLoopMocks.requestResponseIfIdle).toHaveBeenCalled();
  });

  it("exposes micStream when setMicEnabled opens the mic", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    expect(result.current.micStream).toBeNull();

    act(() => {
      result.current.setMicEnabled(true);
    });
    expect(result.current.micStream).not.toBeNull();

    act(() => {
      result.current.setMicEnabled(false);
    });
    expect(result.current.micStream).toBeNull();
  });
});
