import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MeetingMetaAgentProps } from "@museum/metaAgent/MeetingMetaAgent";
import type { ButtonOwner } from "@museum/button/useButton";
import { BUTTON_IDLE_REMIND_MS } from "@voice/useHoldToSpeakHint";

const mockHoldToSpeakHint = vi.hoisted(() => ({
  showHoldToSpeakHint: false,
  idleRemindVisible: false,
}));

vi.mock("@voice/useHoldToSpeakHint", async () => {
  const actual = await vi.importActual<typeof import("@voice/useHoldToSpeakHint")>(
    "@voice/useHoldToSpeakHint",
  );
  return {
    ...actual,
    useHoldToSpeakHint: () => mockHoldToSpeakHint,
  };
});

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

const mockMetaAgentState = vi.hoisted(() => ({
  connectionState: "ready" as "idle" | "connecting" | "ready" | "error",
  agentSpeaking: false,
  lastCaption: "Agent reply" as string | null,
  lastUserTranscript: "Visitor question" as string | null,
}));

vi.mock("@museum/metaAgent/useMetaAgent", () => ({
  useMetaAgent: () => ({
    connectionState: mockMetaAgentState.connectionState,
    error: null,
    lastCaption: mockMetaAgentState.lastCaption,
    lastUserTranscript: mockMetaAgentState.lastUserTranscript,
    agentSpeaking: mockMetaAgentState.agentSpeaking,
    setMicEnabled: mockSetMicEnabled,
    sendUserMessage: mockSendUserMessage,
    requestAgentResponse: mockRequestAgentResponse,
    setAgentOutputMuted: mockSetAgentOutputMuted,
  }),
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
    setMeetingPlaybackPaused: vi.fn(),
    metaAgentActive: false,
    setMetaAgentActive: vi.fn(),
    setAgentSpeaking: vi.fn(),
    onRestartMeeting: vi.fn(),
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
  mockClaim.mockClear();
  mockRelease.mockClear();
  mockSetLed.mockClear();
  mockHoldToSpeakHint.showHoldToSpeakHint = false;
  mockHoldToSpeakHint.idleRemindVisible = false;
});

describe("MeetingMetaAgent", () => {
  it("renders nothing while in standby", () => {
    const { container } = render(<MeetingMetaAgent {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders caption overlay while active", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
    expect(screen.getByTestId("meta-agent-caption-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("voice-guide-user")).toHaveTextContent("Visitor question");
    expect(screen.getByTestId("voice-guide-caption")).toHaveTextContent("Agent reply");
  });

  it("uses council subtitle layout and PTT viz row even when button is not pressed", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
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
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
    act(() => setMockPressed(true));
    expect(mockSetLed).toHaveBeenCalledWith("on");
  });

  it("freezes meeting audio, sets active, opens mic, sends snapshot on button press (standby)", () => {
    const setMeetingPlaybackPaused = vi.fn();
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          setMeetingPlaybackPaused,
          setMetaAgentActive,
          metaAgentActive: false,
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setMeetingPlaybackPaused).toHaveBeenCalledWith(true);
    expect(setMetaAgentActive).toHaveBeenCalledWith(true);
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
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          participationPhase: "warm",
          setMetaAgentActive,
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setMetaAgentActive).toHaveBeenCalledWith(true);
  });

  it("does not activate on press when another owner has the button", () => {
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          participationPhase: "active",
          setMetaAgentActive,
        })}
      />,
    );

    act(() => {
      setMockButtonOwner("human-input");
      setMockPressed(true);
    });

    expect(setMetaAgentActive).not.toHaveBeenCalled();
  });

  it("keeps session active when button ownership is lost (e.g. setup)", () => {
    const setMetaAgentActive = vi.fn();
    const setMeetingPlaybackPaused = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          metaAgentActive: true,
          setMetaAgentActive,
          setMeetingPlaybackPaused,
        })}
      />,
    );

    mockSetMicEnabled.mockClear();

    act(() => setMockButtonOwner("setup"));

    expect(setMetaAgentActive).not.toHaveBeenCalled();
    expect(setMeetingPlaybackPaused).not.toHaveBeenCalled();
  });

  it("closes mic when metaAgentActive transitions to false", () => {
    const { rerender } = render(
      <MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />,
    );

    mockSetMicEnabled.mockClear();

    rerender(<MeetingMetaAgent {...makeProps({ metaAgentActive: false })} />);
    expect(mockSetMicEnabled).toHaveBeenCalledWith(false);
  });

  it("mic follows pressed state inside active mode", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
    mockSetMicEnabled.mockClear();

    act(() => setMockPressed(true));
    expect(mockSetMicEnabled).toHaveBeenCalledWith(true);

    act(() => setMockPressed(false));
    expect(mockSetMicEnabled).toHaveBeenCalledWith(false);
  });

  describe("idle auto-resume", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resumes the meeting 10s after the idle PTT reminder is shown", () => {
      const setMeetingPlaybackPaused = vi.fn();
      const setMetaAgentActive = vi.fn();
      mockHoldToSpeakHint.idleRemindVisible = true;

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMeetingPlaybackPaused,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS - 1);
      });
      expect(setMetaAgentActive).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(setMetaAgentActive).toHaveBeenCalledWith(false);
      expect(setMeetingPlaybackPaused).toHaveBeenCalledWith(false);
      expect(mockSetAgentOutputMuted).toHaveBeenCalledWith(true);
    });

    it("does not resume before the idle PTT reminder appears", () => {
      const setMetaAgentActive = vi.fn();
      mockHoldToSpeakHint.idleRemindVisible = false;

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS * 2);
      });

      expect(setMetaAgentActive).not.toHaveBeenCalled();
    });

    it("does not resume while the agent is speaking", () => {
      const setMetaAgentActive = vi.fn();
      mockMetaAgentState.agentSpeaking = true;
      mockHoldToSpeakHint.idleRemindVisible = true;

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS + 300);
      });

      expect(setMetaAgentActive).not.toHaveBeenCalled();
    });

    it("cancels resume when the idle reminder is dismissed before timeout", () => {
      const setMetaAgentActive = vi.fn();
      mockHoldToSpeakHint.idleRemindVisible = true;

      const { rerender } = render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      mockHoldToSpeakHint.idleRemindVisible = false;
      rerender(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS);
      });

      expect(setMetaAgentActive).not.toHaveBeenCalled();
    });

    it("does not resume while the visitor holds the button", () => {
      const setMetaAgentActive = vi.fn();
      mockHoldToSpeakHint.idleRemindVisible = true;

      render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => setMockPressed(true));

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS + 300);
      });

      expect(setMetaAgentActive).not.toHaveBeenCalled();
    });

    it("does not resume after deactivating before the timeout", () => {
      const setMetaAgentActive = vi.fn();
      mockHoldToSpeakHint.idleRemindVisible = true;

      const { rerender } = render(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: true,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      mockHoldToSpeakHint.idleRemindVisible = false;
      rerender(
        <MeetingMetaAgent
          {...makeProps({
            metaAgentActive: false,
            setMetaAgentActive,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(BUTTON_IDLE_REMIND_MS);
      });

      expect(setMetaAgentActive).not.toHaveBeenCalled();
    });
  });
});
