import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRealtimeVoiceSession } from "@realtime/useRealtimeVoiceSession";

const mockCreateEventLoop = vi.hoisted(() => vi.fn());
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
let mockOnArmed: (() => void) | undefined;
let rafCallback: FrameRequestCallback | null = null;

const eventLoopMocks = vi.hoisted(() => ({
  configureSession: vi.fn(),
  setGreetingHeld: vi.fn(),
  handleEvent: vi.fn(),
  sendUserMessage: vi.fn(),
  cancelActiveResponse: vi.fn(),
  requestResponseIfIdle: vi.fn(),
  isResponseActive: vi.fn(() => false),
  interruptAndRespond: vi.fn(),
}));

vi.mock("@realtime/realtimeEventLoop", () => ({
  createEventLoop: (params: {
    callbacks: typeof eventLoopCallbacks;
  }) => {
    eventLoopCallbacks = params.callbacks;
    mockCreateEventLoop(params);
    return eventLoopMocks;
  },
}));

const mockClassifyRealtimeError = vi.hoisted(() => vi.fn((..._args: unknown[]) => "retryable"));

const MockMicrophoneUnavailableError = vi.hoisted(
  () =>
    class extends Error {
      constructor(readonly reason: string, message: string) {
        super(message);
        this.name = "MicrophoneUnavailableError";
      }
    }
);

vi.mock("@realtime/realtimeConnection", () => ({
  fetchRealtimeBootstrap: (...args: unknown[]) => mockFetchRealtimeBootstrap(...args),
  createRealtimeConnection: (...args: unknown[]) => mockCreateRealtimeConnection(...args),
  acquireMicrophone: () =>
    navigator.mediaDevices.getUserMedia({ audio: true }),
  classifyRealtimeError: (...args: unknown[]) => mockClassifyRealtimeError(...args),
  computeRealtimeRetryDelay: () => 0,
  MicrophoneUnavailableError: MockMicrophoneUnavailableError,
  REALTIME_RETRY_BASE_MS: 1000,
  REALTIME_RETRY_MAX_MS: 15000,
}));

vi.mock("@realtime/micAvailabilityStore", () => ({
  requestMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: true }),
}));

vi.mock("@realtime/remoteAudioAnchor", () => ({
  createRemoteAudioAnchor: (options: {
    onAudioStart: (nowMs: number, ctxTime: number) => void;
    onArmed?: () => void;
  }) => {
    mockOnAudioStart = options.onAudioStart;
    mockOnArmed = options.onArmed;
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
  mockCtxTime = 10;
  mockOnAudioStart = undefined;
  mockOnArmed = undefined;
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

  mockClassifyRealtimeError.mockReturnValue("retryable");

  mockCreateRealtimeConnection.mockImplementation(
    async ({ onOpen, deferMic }: { onOpen: () => void; deferMic?: boolean }) => {
      onOpen();
      const connection = {
        close: vi.fn(),
        micStream: deferMic
          ? null
          : {
              getTracks: () => [{ stop: vi.fn() }],
              getAudioTracks: () => [{ enabled: false }],
            },
        attachMic: vi.fn(async (stream: unknown) => {
          connection.micStream = stream as typeof connection.micStream;
        }),
        detachMic: vi.fn(() => {
          connection.micStream = null;
        }),
        dc: { readyState: "open", send: vi.fn() },
      };
      return connection;
    }
  );

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

/**
 * Connection mock that also delivers a remote audio track, which is what wires
 * up the audio anchor (`mockOnAudioStart` / `mockOnArmed`). Tests that only
 * exercise the data channel can rely on the plainer mock in `beforeEach`.
 */
function mockConnectionWithRemoteTrack(): void {
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
}

describe("useRealtimeVoiceSession", () => {
  it("bootstraps with feature and auth headers", async () => {
    renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockFetchRealtimeBootstrap).toHaveBeenCalledWith(
        { feature: "meta-agent", language: "en" },
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
          callbacks: expect.objectContaining({
            onWordAlignment: expect.any(Function),
          }),
        }),
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

  it("tracks inworld agentSpeaking from audio anchor through subtitle end", async () => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockCreateRemoteAudioAnchor).toHaveBeenCalled();
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
      // Response-transition reset now waits for confirmed silence rather than
      // firing instantly on response.created (fixes captions/anchor clearing
      // before a click-interrupted response's audio has actually stopped) —
      // simulate that confirmation, as if silence was already present.
      mockOnArmed?.();
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

  /**
   * Why this matters: response.created can fire while the previous
   * response's audio is still audibly draining (notably after a
   * click-triggered interrupt). Resetting captions/anchor immediately would
   * hide the old caption before its audio actually stops, and applying new
   * alignment data straight to the still-displayed subtitle track would
   * corrupt it with wrong offsets. Both must wait for confirmed silence.
   */
  it("keeps the previous caption on screen until confirmed silence, buffering alignment data meanwhile", async () => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));

    await waitFor(() => {
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    // First response: nothing anchored yet, so it resets immediately.
    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    // Audio runs to 0.3s of a 0.5s sentence — i.e. still mid-playback.
    act(() => {
      mockCtxTime = 0;
      mockOnAudioStart?.(performance.now(), 0);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 0.3;
      rafCallback?.(0);
    });
    await waitFor(() => {
      expect(result.current.lastCaption).toBe("Hello");
    });

    // Second response.created fires — old audio may still be draining, so
    // the caption must not clear yet, and the new response's alignment data
    // must not be applied to the still-displayed old sentence yet.
    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "World", s: 0.1, e: 0.5 }]);
      rafCallback?.(0);
    });
    expect(result.current.lastCaption).toBe("Hello");

    // Confirmed silence arrives — now it's safe to reset and apply the
    // buffered chunk for the new response.
    act(() => {
      mockOnArmed?.();
      mockCtxTime = 5;
      mockOnAudioStart?.(performance.now(), 5);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 6;
      rafCallback?.(0);
    });
    await waitFor(() => {
      expect(result.current.lastCaption).toBe("World");
    });
  });

  /**
   * The RMS silence detector is approximate, so it is only used when audio may
   * still be draining. On an ordinary turn the playback clock already knows the
   * previous response finished, and the reset must happen immediately —
   * otherwise the old caption lingers into the next response.
   */
  it("resets immediately when the previous response's audio already finished", async () => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));
    await waitFor(() => {
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    // Play a 0.5s sentence and let the clock run past its end.
    act(() => {
      mockCtxTime = 0;
      mockOnAudioStart?.(performance.now(), 0);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 1;
      rafCallback?.(0);
    });
    await waitFor(() => {
      expect(result.current.lastCaption).toBe("Hello");
    });

    // Next response starts. No confirmed-silence signal is delivered — the
    // caption must clear anyway, on the playback clock alone.
    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.lastCaption).toBeNull();
  });

  /**
   * A cancelled response stops emitting alignment data at the cut, so the
   * playback clock under-reports its duration and can claim the audio finished
   * while it is still draining. Resetting on that would anchor the next
   * response's subtitle clock to a word of the old, still-audible audio.
   */
  // Whether the interrupt happened is transition state, so it must hold
  // regardless of whether this session exposes `agentSpeaking`.
  it.each([true, false])("waits for confirmed silence after a cancelled response even if the clock says finished (trackAgentSpeaking=%s)", async (trackAgentSpeaking) => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() =>
      useRealtimeVoiceSession({ ...defaultParams, trackAgentSpeaking }),
    );
    await waitFor(() => {
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    // Clock runs past the (under-reported) end of the alignment data.
    act(() => {
      mockCtxTime = 0;
      mockOnAudioStart?.(performance.now(), 0);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 1;
      rafCallback?.(0);
    });
    await waitFor(() => {
      expect(result.current.lastCaption).toBe("Hello");
    });

    // The response was cut short rather than completing.
    act(() => {
      eventLoopCallbacks.onResponseDone?.({ status: "cancelled" });
    });

    // Next response starts: audio may still be draining, so the caption must
    // stay until silence is confirmed, despite the clock saying otherwise.
    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });
    expect(result.current.lastCaption).toBe("Hello");

    act(() => {
      mockOnArmed?.();
    });
    expect(result.current.lastCaption).toBeNull();
  });

  /**
   * The truncation offset says how much of the assistant's audio the visitor
   * actually heard. It is only meaningful while the anchor and subtitle track
   * describe the same response the event loop is about to truncate.
   */
  it("sends a truncation offset once the playback timeline has settled", async () => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));
    await waitFor(() => {
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
      mockOnArmed?.();
      mockCtxTime = 0;
      mockOnAudioStart?.(performance.now(), 0);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 0.1;
    });

    act(() => {
      result.current.interruptAndRespond("(reaction)", "click-reaction");
    });

    expect(eventLoopMocks.interruptAndRespond).toHaveBeenCalledWith(
      "(reaction)",
      expect.objectContaining({ audioElapsedMs: 100 }),
    );
  });

  /**
   * Between response.created and the confirmed-silence reset, the anchor and
   * subtitle track still describe the previous response while the event loop
   * has already advanced to the new one — an offset from that timeline would
   * truncate the wrong response at a meaningless point.
   */
  it("omits the truncation offset while a response transition is pending", async () => {
    mockConnectionWithRemoteTrack();

    const { result } = renderHook(() => useRealtimeVoiceSession(defaultParams));
    await waitFor(() => {
      expect(mockOnAudioStart).toBeTypeOf("function");
    });

    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
      mockOnArmed?.();
      mockCtxTime = 0;
      mockOnAudioStart?.(performance.now(), 0);
      eventLoopCallbacks.onWordAlignment?.(1, [{ w: "Hello", s: 0.1, e: 0.5 }]);
      eventLoopCallbacks.onWordAlignment?.(1, []);
      mockCtxTime = 0.1;
    });

    // Next response starts; confirmed silence has not arrived yet.
    act(() => {
      eventLoopCallbacks.onResponseStarted?.();
    });

    act(() => {
      result.current.interruptAndRespond("(reaction)", "click-reaction");
    });

    expect(eventLoopMocks.interruptAndRespond).toHaveBeenCalledWith(
      "(reaction)",
      expect.objectContaining({ audioElapsedMs: undefined }),
    );
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

  it("connects without asking for the microphone when deferMic is set", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });

    const { result } = renderHook(() =>
      useRealtimeVoiceSession({ ...defaultParams, deferMic: true })
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    // No getUserMedia means no permission prompt — the whole point of deferring.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.micStream).toBeNull();
  });

  it("attaches and releases the microphone on a live deferred session", async () => {
    const { result } = renderHook(() =>
      useRealtimeVoiceSession({ ...defaultParams, deferMic: true })
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    let attached: boolean | undefined;
    await act(async () => {
      attached = await result.current.attachMic();
    });

    expect(attached).toBe(true);
    expect(result.current.micStream).not.toBeNull();
    // Still the same session — attaching a mic must not reconnect.
    expect(mockCreateRealtimeConnection).toHaveBeenCalledTimes(1);
    expect(result.current.connectionState).toBe("ready");

    act(() => {
      result.current.detachMic();
    });

    expect(result.current.micStream).toBeNull();
    expect(result.current.connectionState).toBe("ready");
  });

  it("reports an unavailable microphone without killing the session", async () => {
    const onUnavailable = vi.fn();
    const onFatalError = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeVoiceSession({ ...defaultParams, deferMic: true, onUnavailable, onFatalError })
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });

    mockClassifyRealtimeError.mockReturnValue("unavailable");
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new MockMicrophoneUnavailableError("permission_denied", "blocked")),
      },
    });

    let attached: boolean | undefined;
    await act(async () => {
      attached = await result.current.attachMic();
    });

    expect(attached).toBe(false);
    expect(onUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "permission_denied" })
    );
    expect(onFatalError).not.toHaveBeenCalled();
    // The agent keeps talking; only listening is off the table.
    expect(result.current.connectionState).toBe("ready");
  });

  it("retries instead of going quiet when the connect times out", async () => {
    // Regression: a timeout surfaces as an AbortError from fetch. Treating that
    // as our own cancellation left the session stuck on "connecting" forever.
    mockFetchRealtimeBootstrap.mockRejectedValueOnce(
      Object.assign(new Error("Realtime request timed out after 15000ms"), {
        name: "RealtimeTimeoutError",
      })
    );

    const { result } = renderHook(() =>
      useRealtimeVoiceSession({
        ...defaultParams,
        retryPolicy: { maxRetries: 3, giveUpSilently: false },
      })
    );

    await waitFor(() => {
      expect(result.current.connectionState).toBe("ready");
    });
    expect(mockFetchRealtimeBootstrap).toHaveBeenCalledTimes(2);
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

  it("does not hold the greeting when the page became audible before connecting", async () => {
    // Regression: `audible` is read when the data channel opens, which is long
    // after any render — the autoplay probe usually answers in between. Syncing
    // the ref on a dependency froze it at its first-render value, so a page
    // that became audible during the handshake held its greeting forever: the
    // release effect had already run against a session that did not exist yet,
    // and `audible` never changed again to re-fire it.
    let openChannel: (() => void) | undefined;
    mockCreateRealtimeConnection.mockImplementation(async ({ onOpen }: { onOpen: () => void }) => {
      openChannel = onOpen;
      return {
        close: vi.fn(),
        micStream: { getTracks: () => [{ stop: vi.fn() }], getAudioTracks: () => [] },
        dc: { readyState: "open", send: vi.fn() },
      };
    });

    const { rerender } = renderHook(
      ({ audible }) =>
        useRealtimeVoiceSession({ ...defaultParams, triggerGreetingOnReady: true, audible }),
      { initialProps: { audible: false } },
    );

    await waitFor(() => expect(openChannel).toBeDefined());

    // The probe answers mid-handshake, before there is an event loop to tell.
    rerender({ audible: true });
    act(() => openChannel?.());

    expect(eventLoopMocks.configureSession).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ holdGreeting: false }),
    );
  });

  it("holds the greeting until the page becomes audible", async () => {
    const { rerender } = renderHook(
      ({ audible }) =>
        useRealtimeVoiceSession({ ...defaultParams, triggerGreetingOnReady: true, audible }),
      { initialProps: { audible: false } },
    );

    await waitFor(() => {
      expect(eventLoopMocks.configureSession).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ holdGreeting: true }),
      );
    });

    rerender({ audible: true });

    await waitFor(() => {
      expect(eventLoopMocks.setGreetingHeld).toHaveBeenCalledWith(false);
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
