import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMetaAgent } from "@/museum/metaAgent/useMetaAgent";

const mockCreateEventLoop = vi.hoisted(() => vi.fn());
const mockCreateCaptionScheduler = vi.hoisted(() => vi.fn());
const mockFetchRealtimeBootstrap = vi.hoisted(() => vi.fn());
const mockCreateRealtimeConnection = vi.hoisted(() => vi.fn());

let eventLoopCallbacks: {
  onCaption?: (text: string | null) => void;
  onUserTranscript?: (text: string) => void;
  onAudioPartReady?: () => void;
} = {};

const schedulerMocks = vi.hoisted(() => ({
  setAudioAnchor: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock("@voice/realtimeEventLoop", () => ({
  createEventLoop: (params: {
    callbacks: typeof eventLoopCallbacks;
    captionScheduler: unknown;
  }) => {
    eventLoopCallbacks = params.callbacks;
    mockCreateEventLoop(params);
    return {
      configureSession: vi.fn(),
      handleEvent: vi.fn(),
      sendUserMessage: vi.fn(),
      cancelActiveResponse: vi.fn(),
      requestResponseIfIdle: vi.fn(),
      isResponseActive: vi.fn(() => false),
    };
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
  language: "en",
  liveKey: "live-key",
  instructions: "Be helpful.",
  tools: [],
  toolHandlers: {},
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

describe("useMetaAgent", () => {
  it("wires caption scheduler and user transcript callbacks", async () => {
    const { result } = renderHook(() => useMetaAgent(defaultParams));

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

  it("anchors captions when agent audio is ready", async () => {
    renderHook(() => useMetaAgent(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    vi.useFakeTimers();
    try {
      act(() => {
        eventLoopCallbacks.onAudioPartReady?.();
      });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(schedulerMocks.setAudioAnchor).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears captions when agent output is muted", async () => {
    const { result } = renderHook(() => useMetaAgent(defaultParams));

    await waitFor(() => {
      expect(mockCreateEventLoop).toHaveBeenCalled();
    });

    act(() => {
      eventLoopCallbacks.onUserTranscript?.("Hello");
      eventLoopCallbacks.onCaption?.("Hi there");
    });

    expect(result.current.lastUserTranscript).toBe("Hello");
    expect(result.current.lastCaption).toBe("Hi there");

    act(() => {
      result.current.setAgentOutputMuted(true);
    });

    expect(result.current.lastCaption).toBeNull();
    expect(result.current.lastUserTranscript).toBeNull();
  });
});
