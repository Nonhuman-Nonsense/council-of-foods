import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MeetingMetaAgentProps } from "@museum/metaAgent/MeetingMetaAgent";
import type { ButtonOwner } from "@museum/button/buttonIntent";

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

vi.mock("@museum/button/hooks", async () => {
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
        rawPressed: mockButtonState.pressed,
        isOwner,
      };
    },
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
  mockButtonState.buttonOwner = "meta-agent";
  mockButtonListeners.clear();
  mockSetMicEnabled.mockClear();
  mockSendUserMessage.mockClear();
  mockSetAgentOutputMuted.mockClear();
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
    render(<MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />);
    expect(screen.getByTestId("meta-agent-caption-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("voice-guide-user")).toHaveTextContent("Visitor question");
    expect(screen.getByTestId("voice-guide-caption")).toHaveTextContent("Agent reply");
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
});
