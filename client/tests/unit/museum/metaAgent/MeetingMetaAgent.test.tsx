import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, renderHook } from "@testing-library/react";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MeetingMetaAgentProps } from "@museum/metaAgent/MeetingMetaAgent";
import type { ButtonOwner } from "@museum/button/useButton";
import { BUTTON_BANNER_IDLE_MS, useButtonBanner } from "@museum/button/useButtonBanner";
import { useErrorStore } from "@main/overlay/errorStore";

const mockClaim = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockSetLed = vi.hoisted(() => vi.fn());

const mockButtonState = vi.hoisted(() => ({
  pressed: false,
  buttonOwner: "meta-agent" as ButtonOwner | null,
}));
const mockButtonListeners = vi.hoisted(() => new Set<() => void>());

function setMockPressed(value: boolean) {
  mockButtonState.pressed = value;
  mockButtonListeners.forEach((l) => l());
}

function setMockButtonOwner(owner: ButtonOwner | null) {
  mockButtonState.buttonOwner = owner;
  mockButtonListeners.forEach((l) => l());
}

vi.mock("@museum/button/useButton", async () => {
  const React = await import("react");
  return {
    useButton: (owner: ButtonOwner) => {
      const pressed = React.useSyncExternalStore(
        (onStoreChange: () => void) => {
          mockButtonListeners.add(onStoreChange);
          return () => mockButtonListeners.delete(onStoreChange);
        },
        () => mockButtonState.buttonOwner === owner && mockButtonState.pressed,
      );
      const isOwner = React.useSyncExternalStore(
        (onStoreChange: () => void) => {
          mockButtonListeners.add(onStoreChange);
          return () => mockButtonListeners.delete(onStoreChange);
        },
        () => mockButtonState.buttonOwner === owner,
      );
      return {
        claim: mockClaim,
        release: mockRelease,
        setLed: mockSetLed,
        pressed,
        isOwner,
      };
    },
  };
});

const mockSetMicEnabled = vi.hoisted(() => vi.fn());
const mockSendUserMessage = vi.hoisted(() => vi.fn());
const mockRequestAgentResponse = vi.hoisted(() => vi.fn());
const mockSetAgentOutputMuted = vi.hoisted(() => vi.fn());
const mockReconfigureSession = vi.hoisted(() => vi.fn());

const sessionCallbacks = vi.hoisted(() => ({
  onSessionReady: undefined as (() => void) | undefined,
}));

const mockMetaAgentState = vi.hoisted(() => ({
  connectionState: "ready" as "idle" | "connecting" | "ready" | "error",
  agentSpeaking: false,
  lastCaption: "Agent reply" as string | null,
  lastUserTranscript: "Visitor question" as string | null,
}));

vi.mock("@museum/metaAgent/useMetaAgent", () => ({
  useMetaAgent: (params: { onSessionReady?: () => void }) => {
    sessionCallbacks.onSessionReady = params.onSessionReady;
    return {
      connectionState: mockMetaAgentState.connectionState,
      lastCaption: mockMetaAgentState.lastCaption,
      lastUserTranscript: mockMetaAgentState.lastUserTranscript,
    agentSpeaking: mockMetaAgentState.agentSpeaking,
    setMicEnabled: mockSetMicEnabled,
      sendUserMessage: mockSendUserMessage,
      requestAgentResponse: mockRequestAgentResponse,
      setAgentOutputMuted: mockSetAgentOutputMuted,
      reconfigureSession: mockReconfigureSession,
    };
  },
}));

vi.mock("@main/Loading", () => ({
  default: () => <div data-testid="meta-agent-loading">Loading</div>,
}));

vi.mock("@realtime/RealtimeCaptionOverlay", () => ({
  default: (props: {
    lastCaption: string | null;
    lastUserTranscript: string | null;
    subtitleLayout?: string;
    showPttVisualizer?: boolean;
    micActive?: boolean;
  }) => (
    <div
      data-testid="meta-agent-caption-overlay"
      data-subtitle-layout={props.subtitleLayout}
      data-show-ptt-viz={String(props.showPttVisualizer)}
      data-mic-active={String(props.micActive)}
    >
      {props.lastUserTranscript ? (
        <span data-testid="voice-guide-user">{props.lastUserTranscript}</span>
      ) : null}
      {props.lastCaption ? (
        <span data-testid="voice-guide-caption">{props.lastCaption}</span>
      ) : null}
    </div>
  ),
}));

function makeProps(overrides: Partial<MeetingMetaAgentProps> = {}): MeetingMetaAgentProps {
  return {
    liveKey: "live-key-123",
    language: "en",
    participationPhase: "off",
    metaAgentPhase: "inactive",
    setMetaAgentPhase: vi.fn(),
    setAgentSpeaking: vi.fn(),
    onRestartMeeting: vi.fn(),
    onExtendMeeting: vi.fn(),
    onConcludeMeeting: vi.fn(),
    councilState: "playing",
    topic: { id: "forests", title: "Forests", description: "", prompt: "" },
    participants: [
      { id: "water", name: "Water", description: "", prompt: "", voice: "" },
    ],
    currentSpeakerName: "Water",
    humanName: "Alice",
    ...overrides,
  };
}

beforeEach(() => {
  useErrorStore.getState().resetForTests();
  mockButtonState.pressed = false;
  mockButtonState.buttonOwner = "meta-agent";
  mockButtonListeners.clear();
  mockMetaAgentState.connectionState = "ready";
  mockMetaAgentState.agentSpeaking = false;
  mockMetaAgentState.lastCaption = "Agent reply";
  mockMetaAgentState.lastUserTranscript = "Visitor question";
  mockSetMicEnabled.mockClear();
  mockSendUserMessage.mockClear();
  mockRequestAgentResponse.mockClear();
  mockSetAgentOutputMuted.mockClear();
  mockReconfigureSession.mockClear();
  sessionCallbacks.onSessionReady = undefined;
  mockClaim.mockClear();
  mockRelease.mockClear();
  mockSetLed.mockClear();
});

describe("MeetingMetaAgent", () => {
  it("renders nothing while in standby", () => {
    const { container } = render(<MeetingMetaAgent {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders caption overlay while active", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "interruption" })} />);
    expect(screen.getByTestId("meta-agent-caption-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("voice-guide-user")).toHaveTextContent("Visitor question");
    expect(screen.getByTestId("voice-guide-caption")).toHaveTextContent("Agent reply");
  });

  it("uses council subtitle layout and PTT viz row even when button is not pressed", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "interruption" })} />);
    const overlay = screen.getByTestId("meta-agent-caption-overlay");
    expect(overlay).toHaveAttribute("data-subtitle-layout", "council");
    expect(overlay).toHaveAttribute("data-show-ptt-viz", "true");
    expect(overlay).toHaveAttribute("data-mic-active", "false");
  });

  it("claims the button on mount and releases on unmount", () => {
    const { unmount } = render(<MeetingMetaAgent {...makeProps()} />);
    expect(mockClaim).toHaveBeenCalled();
    unmount();
    expect(mockRelease).toHaveBeenCalled();
  });

  it("sets LED pulse in standby and on while active and pressed", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "interruption" })} />);
    act(() => setMockPressed(true));
    expect(mockSetLed).toHaveBeenCalledWith("on");
  });

  it("sets active, opens mic, sends snapshot on button press (standby)", () => {
    const setMetaAgentPhase = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          setMetaAgentPhase,
          metaAgentPhase: "inactive",
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setMetaAgentPhase).toHaveBeenCalledWith("interruption");
    expect(mockSetAgentOutputMuted).toHaveBeenCalledWith(false);
    expect(mockSetMicEnabled).toHaveBeenCalledWith(true);
    expect(mockSendUserMessage).toHaveBeenCalledWith(
      expect.stringMatching(/STATE SYNC/),
    );
    expect(mockSendUserMessage).toHaveBeenCalledWith(
      expect.stringMatching(/interruption greeting/i),
    );
    expect(mockRequestAgentResponse).toHaveBeenCalled();
  });

  it("activates on press during warm phase when meta-agent owns the button", () => {
    const setMetaAgentPhase = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          participationPhase: "warm",
          setMetaAgentPhase,
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setMetaAgentPhase).toHaveBeenCalledWith("interruption");
  });

  it("does not activate on press when another owner has the button", () => {
    const setMetaAgentPhase = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          participationPhase: "active",
          setMetaAgentPhase,
        })}
      />,
    );

    act(() => {
      setMockButtonOwner("human-input");
      setMockPressed(true);
    });

    expect(setMetaAgentPhase).not.toHaveBeenCalled();
  });

  it("keeps session active when button ownership is lost (e.g. setup)", () => {
    const setMetaAgentPhase = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          metaAgentPhase: "interruption",
          setMetaAgentPhase,
        })}
      />,
    );

    mockSetMicEnabled.mockClear();

    act(() => setMockButtonOwner("setup"));

    expect(setMetaAgentPhase).not.toHaveBeenCalled();
  });

  it("closes mic when metaAgentPhase transitions to inactive", () => {
    const { rerender } = render(
      <MeetingMetaAgent {...makeProps({ metaAgentPhase: "interruption" })} />,
    );

    mockSetMicEnabled.mockClear();

    rerender(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "inactive" })} />);
    expect(mockSetMicEnabled).toHaveBeenCalledWith(false);
  });

  it("mic follows pressed state inside active mode", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "interruption" })} />);
    mockSetMicEnabled.mockClear();

    act(() => setMockPressed(true));
    expect(mockSetMicEnabled).toHaveBeenCalledWith(true);

    act(() => setMockPressed(false));
    expect(mockSetMicEnabled).toHaveBeenCalledWith(false);
  });

  describe("extension phase", () => {
    it("renders caption overlay while in extension", () => {
      render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "extension" })} />);
      expect(screen.getByTestId("meta-agent-caption-overlay")).toBeInTheDocument();
    });

    it("does not enter interruption on PTT while in extension", () => {
      const setMetaAgentPhase = vi.fn();
      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "extension",
            setMetaAgentPhase,
          })}
        />,
      );

      mockSendUserMessage.mockClear();
      act(() => setMockPressed(true));

      expect(setMetaAgentPhase).not.toHaveBeenCalledWith("interruption");
      expect(mockSendUserMessage).not.toHaveBeenCalledWith(
        expect.stringMatching(/interruption greeting/i),
      );
    });

    it("reconfigures session when entering extension", () => {
      render(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "extension" })} />);
      expect(mockReconfigureSession).toHaveBeenCalled();
    });

    it("shows loader until the extension agent starts speaking", () => {
      const { rerender } = render(
        <MeetingMetaAgent {...makeProps({ metaAgentPhase: "extension" })} />,
      );
      expect(screen.getByTestId("meta-agent-loading")).toBeInTheDocument();

      mockMetaAgentState.agentSpeaking = true;
      rerender(<MeetingMetaAgent {...makeProps({ metaAgentPhase: "extension" })} />);
      expect(screen.queryByTestId("meta-agent-loading")).not.toBeInTheDocument();
    });

    it("activates extension via onSessionReady with snapshot and chair turn", () => {
      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "extension",
            councilState: "query_extension",
          })}
        />,
      );

      mockSendUserMessage.mockClear();
      mockRequestAgentResponse.mockClear();

      act(() => {
        sessionCallbacks.onSessionReady?.();
      });

      expect(mockSendUserMessage).toHaveBeenCalledWith(
        expect.stringMatching(/meta_agent_extension/),
      );
      expect(mockSendUserMessage).toHaveBeenCalledWith(
        expect.stringMatching(/extend or conclude/i),
      );
      expect(mockRequestAgentResponse).toHaveBeenCalled();
      expect(mockSetAgentOutputMuted).toHaveBeenCalledWith(false);
    });

    it("concludes the meeting 10s after idle remind in extension phase", () => {
      vi.useFakeTimers();
      const setMetaAgentPhase = vi.fn();
      const onConcludeMeeting = vi.fn();

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "extension",
            setMetaAgentPhase,
            onConcludeMeeting,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });
      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });

      expect(onConcludeMeeting).toHaveBeenCalled();
      expect(setMetaAgentPhase).toHaveBeenCalledWith("inactive");
      expect(mockSetAgentOutputMuted).toHaveBeenCalledWith(true);
      vi.useRealTimers();
    });
  });

  describe("idle auto-resume", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resumes the meeting when the visitor never presses PTT", () => {
      const setMetaAgentPhase = vi.fn();

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });
      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });

      expect(setMetaAgentPhase).toHaveBeenCalledWith("inactive");
    });

    it("resumes the meeting 10s after the idle PTT reminder is shown", () => {
      const setMetaAgentPhase = vi.fn();

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });
      expect(setMetaAgentPhase).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });

      expect(setMetaAgentPhase).toHaveBeenCalledWith("inactive");
      expect(mockSetAgentOutputMuted).toHaveBeenCalledWith(true);
    });

    it("does not resume before the idle PTT reminder appears", () => {
      const setMetaAgentPhase = vi.fn();

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS - 1);
      });

      expect(setMetaAgentPhase).not.toHaveBeenCalled();
    });

    it("does not resume while the agent is speaking", () => {
      const setMetaAgentPhase = vi.fn();
      mockMetaAgentState.agentSpeaking = true;

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS * 2);
      });

      expect(setMetaAgentPhase).not.toHaveBeenCalled();
    });

    it("cancels resume when idle remind is reset before timeout", () => {
      const onIdleTerminal = vi.fn();
      const { result } = renderHook(() =>
        useButtonBanner({
          owner: "meta-agent",
          sessionActive: true,
          isConnecting: false,
          micOpen: false,
          onIdleTerminal,
          canIdleTerminal: () => true,
        }),
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });

      act(() => {
        result.current.bumpBannerActivity();
      });

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS * 2);
      });

      expect(onIdleTerminal).not.toHaveBeenCalled();
    });

    it("does not resume while the visitor holds the button", () => {
      const setMetaAgentPhase = vi.fn();

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS);
      });
      act(() => setMockPressed(true));

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS * 2);
      });

      expect(setMetaAgentPhase).not.toHaveBeenCalled();
    });

    it("does not resume after deactivating before the timeout", () => {
      const setMetaAgentPhase = vi.fn();

      const { rerender } = render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "interruption",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      rerender(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentPhase: "inactive",
            setMetaAgentPhase,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_BANNER_IDLE_MS * 2);
      });

      expect(setMetaAgentPhase).not.toHaveBeenCalled();
    });
  });
});
