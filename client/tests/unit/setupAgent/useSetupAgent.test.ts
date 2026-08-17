import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSetupAgent, type SetupAgentContext } from "@setupAgent/useSetupAgent";
import { useMicAvailabilityStore } from "@realtime/micAvailabilityStore";

const mockUseRealtimeVoiceSession = vi.hoisted(() => vi.fn());
const mockRefreshMicAvailability = vi.hoisted(() => vi.fn());
/** Whether the browser would let the agent be heard right now. */
const mockAutoplay = vi.hoisted(() => ({ allowed: true }));

vi.mock("@/audio/canAutoplay", () => ({
  useAutoplayAllowed: () => mockAutoplay.allowed,
}));

vi.mock("@realtime/useRealtimeVoiceSession", () => ({
  useRealtimeVoiceSession: (params: unknown) => mockUseRealtimeVoiceSession(params),
  getRealtimeRetryPolicy: (critical: boolean) => ({
    maxRetries: critical ? Infinity : 3,
    giveUpSilently: !critical,
  }),
}));

// The store itself is real (its transitions are the contract under test); only
// the browser probe is stubbed out.
vi.mock("@realtime/micAvailabilityStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@realtime/micAvailabilityStore")>();
  return { ...actual, refreshMicAvailability: mockRefreshMicAvailability };
});

const attachMic = vi.fn(async () => true);
const detachMic = vi.fn();

const baseSession = {
  connectionState: "idle" as const,
  lastCaption: null,
  lastUserTranscript: null,
  hasReceivedAudioPart: false,
  agentSpeaking: false,
  micStream: null as MediaStream | null,
  setMicEnabled: vi.fn(),
  attachMic,
  detachMic,
  sendUserMessage: vi.fn(),
  setAgentOutputMuted: vi.fn(),
  reconfigureSession: vi.fn(),
  interruptAndRespond: vi.fn(),
};

const readySession = { ...baseSession, connectionState: "ready" as const };

const selectTopicHandler = vi.fn(() => ({ ok: true as const }));
const currentTopicHandler = vi.fn(() => ({ ok: true as const }));

const defaultParams = {
  language: "en",
  // Mirrors the real wiring: the brief is built from the mic state at connect,
  // the tool list is static.
  instructions: ({ canHearVisitor }: SetupAgentContext) =>
    canHearVisitor ? "Guide the visitor." : "Comment on what the visitor clicks.",
  tools: [{ type: "function" as const, name: "select_topic" }],
  toolHandlers: {
    select_topic: selectTopicHandler,
    current_topic: currentTopicHandler,
  },
};

/** The handler map as it reaches the realtime session, after guarding. */
function handlersFromLastCall(): Record<string, (args: unknown) => unknown> {
  const calls = mockUseRealtimeVoiceSession.mock.calls;
  return calls[calls.length - 1][0].toolHandlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAutoplay.allowed = true;
  useMicAvailabilityStore.getState().resetForTests();
  attachMic.mockResolvedValue(true);
  mockUseRealtimeVoiceSession.mockReturnValue(baseSession);
});

describe("useSetupAgent", () => {
  it("wires setup-agent feature with greeting and PTT mic", () => {
    renderHook(() => useSetupAgent(defaultParams));

    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "setup-agent",
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

  it("connects without a microphone in web mode, with one in museum", () => {
    renderHook(() => useSetupAgent(defaultParams));
    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({ deferMic: true }),
    );

    renderHook(() => useSetupAgent({ ...defaultParams, isMuseumMode: true }));
    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ deferMic: false }),
    );
  });

  it("waits to connect until the agent could actually be heard", () => {
    // Connecting while audio is blocked loses the greeting into a muted element
    // and pays for the session anyway. The page it happens on is irrelevant —
    // a link pasted straight to the topic step is as cold as the landing page.
    const cases: Array<{
      autoplayAllowed: boolean;
      isMuseumMode?: boolean;
      autoConnect: boolean;
    }> = [
      { autoplayAllowed: false, autoConnect: false },
      { autoplayAllowed: true, autoConnect: true },
      // A kiosk has no gesture to wait for.
      { autoplayAllowed: false, isMuseumMode: true, autoConnect: true },
    ];

    for (const { autoplayAllowed, isMuseumMode, autoConnect } of cases) {
      vi.clearAllMocks();
      mockAutoplay.allowed = autoplayAllowed;

      renderHook(() => useSetupAgent({ ...defaultParams, isMuseumMode }));

      expect(
        mockUseRealtimeVoiceSession,
        `autoplay=${autoplayAllowed}${isMuseumMode ? " / museum" : ""}`,
      ).toHaveBeenCalledWith(expect.objectContaining({ autoConnect }));
    }
  });

  it("connects on an explicit start even while audio is still blocked", async () => {
    // The press is itself the gesture that unblocks audio, so waiting for the
    // probe to catch up would only delay it.
    mockAutoplay.allowed = false;
    const { result } = renderHook(() => useSetupAgent(defaultParams));

    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoConnect: false }),
    );

    act(() => {
      result.current.toggleMic();
    });

    await waitFor(() =>
      expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ autoConnect: true }),
      ),
    );
  });

  it("hands the microphone over when the visitor asks for it", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });

    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
    expect(result.current.micOn).toBe(true);
  });

  it("turns the agent back on when the mic is clicked while it is off", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue({ ...readySession });

    const { result } = renderHook(() =>
      useSetupAgent({ ...defaultParams, initialMuted: true }),
    );

    act(() => {
      result.current.toggleMic();
    });

    // One gesture means both: bring the agent back and take the mic.
    expect(result.current.muted).toBe(false);
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
  });

  it("releases the microphone when toggled off", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...readySession,
      micStream: { id: "mic" } as unknown as MediaStream,
    });

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    expect(result.current.micOn).toBe(true);

    act(() => {
      result.current.toggleMic();
    });

    expect(detachMic).toHaveBeenCalledOnce();
    expect(result.current.micOn).toBe(false);
  });

  it("marks a mic click as the visitor's own request", async () => {
    // requestMicrophone explains a failure the visitor asked for; this is the
    // only signal it has to tell that apart from a background re-attach.
    attachMic.mockResolvedValue(false);
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });

    // Wait for the outcome, not the call: the mic intent is dropped after the
    // attach settles, so asserting on the call alone races the state update.
    await waitFor(() => expect(result.current.micOn).toBe(false));
    expect(attachMic).toHaveBeenCalledWith({ userInitiated: true });
  });

  it("re-attaches the microphone after a reconnect without nagging", async () => {
    // The visitor never let go of the mic — a dropped session shouldn't
    // silently take it away, nor throw an overlay if it can't be recovered.
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    const { result, rerender } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());

    // Drop: session goes away and comes back with no mic attached.
    mockUseRealtimeVoiceSession.mockReturnValue({ ...baseSession, connectionState: "connecting" });
    rerender();
    expect(result.current.micOn).toBe(true);

    attachMic.mockResolvedValue(false);
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    rerender();

    // Not the visitor's request this time, so a failure stays quiet.
    await waitFor(() => expect(attachMic).toHaveBeenCalledTimes(2));
    expect(attachMic).toHaveBeenLastCalledWith({ userInitiated: false });
  });

  it("never re-sends the session config when the mic changes hands", async () => {
    // Nothing in the session config depends on the microphone, and a
    // session.update would reset the turn machinery — dropping any click
    // reaction that was queued waiting for the session to be ready.
    const reconfigureSession = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({ ...readySession, reconfigureSession });

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(result.current.micOn).toBe(true));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(result.current.micOn).toBe(false));

    expect(reconfigureSession).not.toHaveBeenCalled();
  });

  it("puts a mic change on the record without asking the agent to speak", async () => {
    // Someone who just pressed the mic button is about to talk — an "I can hear
    // you now" would land on top of their first sentence.
    const sendUserMessage = vi.fn();
    const interruptAndRespond = vi.fn();
    const requestAgentResponse = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...readySession,
      micStream: { id: "mic" } as unknown as MediaStream,
      sendUserMessage,
      interruptAndRespond,
      requestAgentResponse,
    });

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledOnce());

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(2));

    // The wording is copy; that each direction says something different, and
    // that neither asks the agent to speak, is the contract.
    expect(sendUserMessage.mock.calls[0][0]).not.toBe(sendUserMessage.mock.calls[1][0]);
    expect(interruptAndRespond).not.toHaveBeenCalled();
    expect(requestAgentResponse).not.toHaveBeenCalled();
  });

  it("refuses to act for a visitor who has never spoken", () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    renderHook(() => useSetupAgent(defaultParams));

    const result = handlersFromLastCall().select_topic({ title: "Food Waste" });

    expect(result).toMatchObject({ ok: false });
    expect(selectTopicHandler).not.toHaveBeenCalled();
  });

  it("still answers questions about the current state while the visitor is silent", () => {
    // Refusing these would only make the agent's commentary less accurate.
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    renderHook(() => useSetupAgent(defaultParams));

    handlersFromLastCall().current_topic({});

    expect(currentTopicHandler).toHaveBeenCalledOnce();
  });

  it("acts once the visitor has spoken, and keeps acting after they mute", async () => {
    // "Pick that one" followed immediately by muting: the call lands a beat
    // after the words, and must still work.
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...readySession,
      micStream: { id: "mic" } as unknown as MediaStream,
    });

    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(result.current.micOn).toBe(true));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(result.current.micOn).toBe(false));

    handlersFromLastCall().select_topic({ title: "Food Waste" });
    expect(selectTopicHandler).toHaveBeenCalledOnce();
  });

  it("treats museum as always able to hear the visitor", () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { result } = renderHook(() =>
      useSetupAgent({ ...defaultParams, isMuseumMode: true }),
    );

    expect(result.current.canHearVisitor).toBe(true);
    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ instructions: "Guide the visitor." }),
    );
    // A kiosk visitor can always talk, so its tools are never held back.
    handlersFromLastCall().select_topic({ title: "Food Waste" });
    expect(selectTopicHandler).toHaveBeenCalledOnce();
  });

  it("drops the mic intent when the agent is switched off", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.toggleMic();
    });
    await waitFor(() => expect(result.current.micOn).toBe(true));

    act(() => {
      result.current.stop();
    });

    expect(result.current.micOn).toBe(false);
    expect(result.current.muted).toBe(true);
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
