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
  instructions: ({ hasEverHeardVisitor }: SetupAgentContext) =>
    hasEverHeardVisitor ? "Guide the visitor." : "Comment on what the visitor clicks.",
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

  it("defers the microphone unless it is taken up front", () => {
    renderHook(() => useSetupAgent(defaultParams));
    expect(mockUseRealtimeVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({ deferMic: true, pttMic: false }),
    );

    renderHook(() => useSetupAgent({ ...defaultParams, micUpFront: true }));
    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ deferMic: false, pttMic: true }),
    );
  });

  it("waits to connect until the agent could actually be heard", () => {
    // Connecting while audio is blocked loses the greeting into a muted element
    // and pays for the session anyway. The page it happens on is irrelevant —
    // a link pasted straight to the topic step is as cold as the landing page.
    const cases: Array<{
      autoplayAllowed: boolean;
      unattended?: boolean;
      autoConnect: boolean;
    }> = [
      { autoplayAllowed: false, autoConnect: false },
      { autoplayAllowed: true, autoConnect: true },
      // A kiosk has no gesture to wait for.
      { autoplayAllowed: false, unattended: true, autoConnect: true },
    ];

    for (const { autoplayAllowed, unattended, autoConnect } of cases) {
      vi.clearAllMocks();
      mockAutoplay.allowed = autoplayAllowed;

      renderHook(() => useSetupAgent({ ...defaultParams, unattended }));

      expect(
        mockUseRealtimeVoiceSession,
        `autoplay=${autoplayAllowed}${unattended ? " / unattended" : ""}`,
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
      void result.current.start();
    });

    await waitFor(() =>
      expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ autoConnect: true }),
      ),
    );
  });

  it("starts a cold agent from the mic gesture alone", async () => {
    // Space and the mic button both reach the hook as `micOpen`; either is the
    // gesture that unblocks audio, so neither should wait for the autoplay probe.
    mockAutoplay.allowed = false;

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );
    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoConnect: false }),
    );

    rerender({ micOpen: true });

    await waitFor(() =>
      expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ autoConnect: true }),
      ),
    );
  });

  it("hands the microphone over when the visitor asks for it", async () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );
    expect(attachMic).not.toHaveBeenCalled();

    rerender({ micOpen: true });

    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
  });

  it("keeps the microphone once acquired, gating the track between presses", async () => {
    // Re-acquiring per press would clip the start of every utterance. The
    // browser releases the mic when the session itself is torn down.
    const setMicEnabled = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({ ...readySession, setMicEnabled });

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());

    rerender({ micOpen: false });
    await waitFor(() => expect(setMicEnabled).toHaveBeenLastCalledWith(false));
    expect(detachMic).not.toHaveBeenCalled();

    rerender({ micOpen: true });
    await waitFor(() => expect(setMicEnabled).toHaveBeenLastCalledWith(true));
    expect(attachMic).toHaveBeenCalledOnce();
  });

  it("marks the visitor's own request so a refusal explains itself", async () => {
    // requestMicrophone explains a failure the visitor asked for; this is the
    // only signal it has to tell that apart from a background re-attach.
    attachMic.mockResolvedValue(false);
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });

    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
    expect(attachMic).toHaveBeenCalledWith({ userInitiated: true });
  });

  it("re-attaches the microphone after a reconnect without nagging", async () => {
    // The visitor never let go of the mic — a dropped session shouldn't
    // silently take it away, nor throw an overlay if it can't be recovered.
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());

    // Drop: session goes away and comes back with no mic attached. The visitor
    // never let go, so `micOpen` stays true throughout.
    mockUseRealtimeVoiceSession.mockReturnValue({ ...baseSession, connectionState: "connecting" });
    rerender({ micOpen: true });

    attachMic.mockResolvedValue(false);
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    rerender({ micOpen: true });

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

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
    rerender({ micOpen: false });

    expect(reconfigureSession).not.toHaveBeenCalled();
  });

  it("tells the agent once when the visitor first becomes audible", async () => {
    // Instructions are only read at connect, so without this the agent keeps
    // the "they cannot speak" rules it opened with for the whole session. It
    // asks for no reply: someone who just opened the mic is about to talk.
    const sendUserMessage = vi.fn();
    const interruptAndRespond = vi.fn();
    const requestAgentResponse = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({
      ...readySession,
      sendUserMessage,
      interruptAndRespond,
      requestAgentResponse,
    });

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });
    await waitFor(() => expect(sendUserMessage).toHaveBeenCalledOnce());

    // Push-to-talk shuts the mic between utterances — a closed mic is not news.
    rerender({ micOpen: false });
    rerender({ micOpen: true });
    rerender({ micOpen: false });

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(interruptAndRespond).not.toHaveBeenCalled();
    expect(requestAgentResponse).not.toHaveBeenCalled();
  });

  it("says nothing when a session opens already knowing the visitor", async () => {
    const sendUserMessage = vi.fn();
    mockUseRealtimeVoiceSession.mockReturnValue({ ...readySession, sendUserMessage });

    renderHook(() => useSetupAgent({ ...defaultParams, micUpFront: true }));

    await waitFor(() => expect(mockUseRealtimeVoiceSession).toHaveBeenCalled());
    expect(sendUserMessage).not.toHaveBeenCalled();
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

    const { rerender } = renderHook(
      ({ micOpen }) => useSetupAgent({ ...defaultParams, micOpen }),
      { initialProps: { micOpen: false } },
    );

    rerender({ micOpen: true });
    await waitFor(() => expect(attachMic).toHaveBeenCalledOnce());
    rerender({ micOpen: false });

    handlersFromLastCall().select_topic({ title: "Food Waste" });
    expect(selectTopicHandler).toHaveBeenCalledOnce();
  });

  it("treats a mic taken up front as always able to hear the visitor", () => {
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);

    const { result } = renderHook(() =>
      useSetupAgent({ ...defaultParams, unattended: true, micUpFront: true }),
    );

    expect(result.current.hasEverHeardVisitor).toBe(true);
    expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ instructions: "Guide the visitor." }),
    );
    // A kiosk visitor can always talk, so its tools are never held back.
    handlersFromLastCall().select_topic({ title: "Food Waste" });
    expect(selectTopicHandler).toHaveBeenCalledOnce();
  });

  it("mutes the agent when switched off, which tears the session down", async () => {
    // Teardown is what releases the microphone — nothing detaches it by hand.
    mockUseRealtimeVoiceSession.mockReturnValue(readySession);
    const { result } = renderHook(() => useSetupAgent(defaultParams));

    act(() => {
      result.current.stop();
    });

    expect(result.current.muted).toBe(true);
    await waitFor(() =>
      expect(mockUseRealtimeVoiceSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ sessionActive: false }),
      ),
    );
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
          micUpFront: true,
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
