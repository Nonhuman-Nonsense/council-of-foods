import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MeetingMetaAgentProps } from "@museum/metaAgent/MeetingMetaAgent";
import type { ButtonOwner } from "@museum/button/buttonIntent";

const mockUseButtonLed = vi.hoisted(() => vi.fn());

const mockButtonState = vi.hoisted(() => ({
  pressed: false,
  pressOwner: "meta-agent" as ButtonOwner | null,
}));
const mockButtonListeners = vi.hoisted(() => new Set<() => void>());

function setMockPressed(value: boolean) {
  mockButtonState.pressed = value;
  mockButtonListeners.forEach((l) => l());
}

function setMockPressOwner(owner: ButtonOwner | null) {
  mockButtonState.pressOwner = owner;
  mockButtonListeners.forEach((l) => l());
}

vi.mock("@museum/button/buttonStore", () => ({
  useButtonStore: (selector: (s: typeof mockButtonState) => unknown) =>
    selector(mockButtonState),
}));

vi.mock("@museum/button/hooks", async () => {
  const React = await import("react");
  return {
    useButtonLed: (...args: unknown[]) => mockUseButtonLed(...args),
    useButtonPressed: (owner: ButtonOwner) =>
      React.useSyncExternalStore(
        (onStoreChange: () => void) => {
          mockButtonListeners.add(onStoreChange);
          return () => mockButtonListeners.delete(onStoreChange);
        },
        () => mockButtonState.pressOwner === owner && mockButtonState.pressed,
      ),
    useButtonPressOwner: () =>
      React.useSyncExternalStore(
        (onStoreChange: () => void) => {
          mockButtonListeners.add(onStoreChange);
          return () => mockButtonListeners.delete(onStoreChange);
        },
        () => mockButtonState.pressOwner,
      ),
  };
});

const mockSetMicEnabled = vi.hoisted(() => vi.fn());
const mockSendUserMessage = vi.hoisted(() => vi.fn());
const mockSetAgentOutputMuted = vi.hoisted(() => vi.fn());

vi.mock("@museum/metaAgent/useMetaAgent", () => ({
  useMetaAgent: () => ({
    connectionState: "ready",
    error: null,
    lastCaption: "Agent reply",
    lastUserTranscript: "Visitor question",
    setMicEnabled: mockSetMicEnabled,
    sendUserMessage: mockSendUserMessage,
    setAgentOutputMuted: mockSetAgentOutputMuted,
  }),
}));

vi.mock("@realtime/RealtimeCaptionOverlay", () => ({
  default: (props: {
    lastCaption: string | null;
    lastUserTranscript: string | null;
  }) => (
    <div data-testid="meta-agent-caption-overlay">
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
  mockButtonState.pressOwner = "meta-agent";
  mockButtonListeners.clear();
  mockSetMicEnabled.mockClear();
  mockSendUserMessage.mockClear();
  mockSetAgentOutputMuted.mockClear();
  mockUseButtonLed.mockClear();
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

  it("registers LED intent with meta-agent owner in standby", () => {
    render(<MeetingMetaAgent {...makeProps()} />);
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "pulse");
  });

  it("shows LED on while active and pressed", () => {
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
    act(() => setMockPressed(true));
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "on");
  });

  it("still registers LED intent during warm phase", () => {
    render(<MeetingMetaAgent {...makeProps({ participationPhase: "warm" })} />);
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "pulse");
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
      setMockPressOwner("human-input");
      setMockPressed(true);
    });

    expect(setMetaAgentActive).not.toHaveBeenCalled();
  });

  it("deactivates when press ownership is lost", () => {
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          metaAgentActive: true,
          setMetaAgentActive,
        })}
      />,
    );

    mockSetMicEnabled.mockClear();

    act(() => setMockPressOwner("human-input"));

    expect(setMetaAgentActive).toHaveBeenCalledWith(false);
    expect(mockSetMicEnabled).toHaveBeenCalledWith(false);
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
});
