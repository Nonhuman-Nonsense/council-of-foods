import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";

const mockCreateEventLoop = vi.hoisted(() => vi.fn());
const mockCreateCaptionScheduler = vi.hoisted(() => vi.fn());
const mockFetchRealtimeBootstrap = vi.hoisted(() => vi.fn());
const mockCreateRealtimeConnection = vi.hoisted(() => vi.fn());
const mockCreateRemoteAudioAnchor = vi.hoisted(() => vi.fn());

let eventLoopCallbacks: {
  onCaption?: (text: string | null) => void;
  onUserTranscript?: (text: string) => void;
  onWordAlignment?: (contentIndex: number, words: ReadonlyArray<{ w: string; s: number; e: number }>) => void;
  onAudioPartReady?: () => void;
  onResponseStarted?: () => void;
  onResponseDone?: (info?: { status?: string }) => void;
  onSessionReady?: () => void;
} = {};

let mockCtxTime = 10;
let mockOnAudioStart: ((nowMs: number, ctxTime: number) => void) | undefined;
let rafCallback: FrameRequestCallback | null = null;

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
  acquireMicrophone: () =>
    navigator.mediaDevices.getUserMedia({ audio: true }),
  classifyRealtimeError: () => "retryable",
  computeRealtimeRetryDelay: () => 0,
  REALTIME_RETRY_BASE_MS: 1000,
  REALTIME_RETRY_MAX_MS: 15000,
}));

vi.mock("@voice/remoteAudioAnchor", () => ({
  createRemoteAudioAnchor: (options: { onAudioStart: (nowMs: number, ctxTime: number) => void }) => {
    mockOnAudioStart = options.onAudioStart;
    return mockCreateRemoteAudioAnchor(options);
  },
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
  mockCtxTime = 10;
  mockOnAudioStart = undefined;
  rafCallback = null;

  mockCreateRemoteAudioAnchor.mockImplementation(() => ({
    arm: vi.fn(),
    getCtxTime: () => mockCtxTime,
    dispose: vi.fn(),
  }));

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallback = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  vi.stubGlobal("MediaStream", class {
    constructor(_tracks?: unknown[]) {}
  });

  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

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

  it("wires inworld subtitle track and user transcript callbacks", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          captionScheduler: undefined,
          callbacks: expect.objectContaining({
            onWordAlignment: expect.any(Function),
          }),
        }),
      );
    });
    expect(mockCreateCaptionScheduler).not.toHaveBeenCalled();

    act(() => {
      eventLoopCallbacks.onUserTranscript?.("What is happening?");
    });
    expect(result.current.lastUserTranscript).toBe("What is happening?");

    act(() => {
      eventLoopCallbacks.onCaption?.("The council is discussing forests.");
    });
    expect(result.current.lastCaption).toBe("The council is discussing forests.");
  });

  it("uses caption scheduler for non-inworld providers", async () => {
    mockFetchRealtimeBootstrap.mockResolvedValue({
      provider: "openai",
      session: { audio: { output: { speed: 1 } } },
      iceServers: [],
    });

    renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateCaptionScheduler).toHaveBeenCalled();
      expect(mockCreateEventLoop).toHaveBeenCalledWith(
        expect.objectContaining({ captionScheduler: expect.any(Object) }),
      );
    });
  });

  it("tracks inworld agentSpeaking from audio anchor through subtitle end", async () => {
    mockCreateRealtimeConnection.mockImplementation(async ({ onOpen, onRemoteTrack }: {
      onOpen: () => void;
      onRemoteTrack: (track: MediaStreamTrack) => void;
    }) => {
      onOpen();
      onRemoteTrack({ stop: vi.fn() } as unknown as MediaStreamTrack);
      return {
        close: vi.fn(),
        micStream: {
          getTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [{ enabled: false }],
        },
        dc: { readyState: "open", send: vi.fn() },
      };
    });

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateRemoteAudioAnchor).toHaveBeenCalled();
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.agentSpeaking).toBe(false);

    act(() => {
      mockOnAudioStart?.(performance.now(), 10);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      rafCallback?.(0);
    });

    await waitFor(() => {
      expect(result.current.agentSpeaking).toBe(true);
    });

    act(() => {
      mockCtxTime = 10.6;
      rafCallback?.(0);
    });
    expect(result.current.agentSpeaking).toBe(false);
  });

  it("does not set inworld agentSpeaking on response.created alone", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.agentSpeaking).toBe(false);
  });

  it("toggles agentSpeaking on response lifecycle for non-inworld providers", async () => {
    mockFetchRealtimeBootstrap.mockResolvedValue({
      provider: "openai",
      session: { audio: { output: { speed: 1 } } },
      iceServers: [],
    });

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

  it("forwards onSessionReady from the event loop", async () => {
    const onSessionReady = vi.fn();
    renderHook(() => useRealtimeVoiceSession({ ...defaultParams, onSessionReady }));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onSessionReady?.();
    });

    expect(onSessionReady).toHaveBeenCalledOnce();
  });

  it("clears captions when reconnecting after language change", async () => {
    const { result, rerender } = renderHook(
      ({ language }) => useRealtimeVoiceSession({ ...defaultParams, language }),
      { initialProps: { language: "en" } },
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    act(() => {
      eventLoopCallbacks.onUserTranscript?.("Hello");
      eventLoopCallbacks.onCaption?.("Hi there");
    });
    expect(result.current.lastCaption).toBe("Hi there");
    expect(result.current.lastUserTranscript).toBe("Hello");

    rerender({ language: "sv" });

    await waitFor(() => {
      expect(result.current.lastCaption).toBeNull();
      expect(result.current.lastUserTranscript).toBeNull();
    });
  });

  it("reconfigureSession delegates to the event loop with current config", async () => {
    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    eventLoopMocks.configureSession.mockClear();

    act(() => {
      result.current.reconfigureSession({ triggerGreetingOnReady: false });
    });

    expect(eventLoopMocks.configureSession).toHaveBeenCalledWith(
      expect.any(Object),
      { triggerGreetingOnReady: false },
    );
  });
});
