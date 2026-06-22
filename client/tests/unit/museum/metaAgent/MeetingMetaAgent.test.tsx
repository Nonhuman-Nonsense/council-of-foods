import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MeetingMetaAgentProps } from "@museum/metaAgent/MeetingMetaAgent";

// ── button store / hooks mocks ────────────────────────────────────────────────

const mockUseButtonLed = vi.hoisted(() => vi.fn());

const mockButtonState = vi.hoisted(() => ({ pressed: false }));
const mockButtonListeners = vi.hoisted(() => new Set<() => void>());

function setMockPressed(value: boolean) {
  mockButtonState.pressed = value;
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
    useButtonPressed: (active: boolean) =>
      React.useSyncExternalStore(
        (onStoreChange: () => void) => {
          mockButtonListeners.add(onStoreChange);
          return () => mockButtonListeners.delete(onStoreChange);
        },
        () => (active ? mockButtonState.pressed : false),
      ),
  };
});

// ── useMetaAgent mock ──────────────────────────────────────────────────────────

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

// ── helpers ───────────────────────────────────────────────────────────────────

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
  mockButtonListeners.clear();
  mockSetMicEnabled.mockClear();
  mockSendUserMessage.mockClear();
  mockUseButtonLed.mockClear();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("MeetingMetaAgent", () => {
  it("renders null (no DOM output)", () => {
    const { container } = render(<MeetingMetaAgent {...makeProps()} />);
    expect(container.firstChild).toBeNull();
  });

  it("registers LED intent with meta-agent owner in standby", () => {
    render(<MeetingMetaAgent {...makeProps()} />);
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "pulse", true);
  });

  it("shows LED 'on' while active + pressed", () => {
    render(
      <MeetingMetaAgent {...makeProps({ metaAgentActive: true })} />,
    );
    act(() => setMockPressed(true));
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "on", true);
  });

  it("does not register LED intent when participationPhase is not off", () => {
    render(<MeetingMetaAgent {...makeProps({ participationPhase: "active" })} />);
    // active=false — owner unregisters itself
    expect(mockUseButtonLed).toHaveBeenCalledWith("meta-agent", "pulse", false);
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

  it("does not pause or activate on press when participationPhase is not off", () => {
    const setPaused = vi.fn();
    const setMetaAgentActive = vi.fn();

    render(
      <MeetingMetaAgent
        {...makeProps({
          setPaused,
          setMetaAgentActive,
          participationPhase: "active",
          metaAgentActive: false,
        })}
      />,
    );

    act(() => setMockPressed(true));

    expect(setPaused).not.toHaveBeenCalled();
    expect(setMetaAgentActive).not.toHaveBeenCalled();
    expect(mockSetMicEnabled).not.toHaveBeenCalledWith(true);
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
