import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
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

vi.mock("@museum/metaAgent/useMetaAgent", () => ({
  useMetaAgent: () => ({
    connectionState: "ready",
    error: null,
    setMicEnabled: mockSetMicEnabled,
    sendUserMessage: mockSendUserMessage,
  }),
}));

function makeProps(overrides: Partial<MeetingMetaAgentProps> = {}): MeetingMetaAgentProps {
  return {
    liveKey: "live-key-123",
    language: "en",
    participationPhase: "off",
    isPaused: false,
    setPaused: vi.fn(),
    metaAgentActive: false,
    setMetaAgentActive: vi.fn(),
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
  mockUseButtonLed.mockClear();
});

describe("MeetingMetaAgent", () => {
  it("renders null (no DOM output)", () => {
    const { container } = render(<MeetingMetaAgent {...makeProps()} />);
    expect(container.firstChild).toBeNull();
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

  it("pauses meeting, sets active, opens mic, sends snapshot on button press (standby)", () => {
    const setPaused = vi.fn();
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          setPaused,
          setMetaAgentActive,
          metaAgentActive: false,
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setPaused).toHaveBeenCalledWith(true);
    expect(setMetaAgentActive).toHaveBeenCalledWith(true);
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
