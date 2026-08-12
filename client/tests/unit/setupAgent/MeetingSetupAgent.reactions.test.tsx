import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import MeetingSetupAgent from "@setupAgent/MeetingSetupAgent";
import type { MeetingSetupUserEvent } from "@newMeeting/meetingSetup";

const mockInterruptAndRespond = vi.hoisted(() => vi.fn());
const mockSelectedCharacters = vi.hoisted(() => ({ value: ["chair"] as string[] }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/navigation", () => ({
  useSwitchLanguage: () => ({ switchLanguage: vi.fn(), otherLanguages: [] }),
}));

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => ({
    isMuseumMode: false,
    mode: "web",
    setAppMode: vi.fn(),
    agentMode: "always-on",
    setAgentMode: vi.fn(),
  }),
  getAppMode: () => "web",
}));

vi.mock("@/museum/button/useButton", () => ({
  useButton: () => ({ claim: vi.fn(), release: vi.fn(), setLed: vi.fn(), pressed: false, isOwner: true }),
}));

vi.mock("@setupAgent/useSetupAgent", () => ({
  useSetupAgent: () => ({
    isConnecting: false,
    lastCaption: null,
    lastUserTranscript: null,
    agentSpeaking: false,
    micStream: null,
    muted: false,
    setMuted: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    sendUserMessage: vi.fn(),
    requestAgentResponse: vi.fn(),
    interruptAndRespond: mockInterruptAndRespond,
  }),
}));

vi.mock("@setupAgent/SetupAgentOverlay", () => ({ default: () => null }));
vi.mock("@main/Loading", () => ({ default: () => null }));

vi.mock("@newMeeting/meetingSetupStore", () => {
  const state = () => ({
    selectedTopic: null,
    customTopic: "",
    visitorName: "",
    selectedCharacters: mockSelectedCharacters.value,
  });
  const useMeetingSetupStore = () => state();
  useMeetingSetupStore.getState = state;
  return { useMeetingSetupStore };
});

const defaultProps = {
  phase: "characters" as const,
  lastUserEvent: null as MeetingSetupUserEvent | null,
  onBeginSetup: vi.fn(),
  onGoToTopicStep: vi.fn(),
  onSelectTopic: vi.fn(),
  onStartMeeting: vi.fn(),
};

/** The chair is always selected; foods are what the visitor picks. */
function councilEvent(selectedNames: string[], isFull = false): MeetingSetupUserEvent {
  return { type: "character_selected", selectedNames, chairName: "Water", isFull };
}

function lastMessage(): string {
  const calls = mockInterruptAndRespond.mock.calls;
  return calls[calls.length - 1]?.[0] ?? "";
}

describe("MeetingSetupAgent click reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSelectedCharacters.value = ["chair"];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The reaction is debounced, so picking two foods quickly delivers a single
   * message. It has to name both — reacting only to the last one is what made
   * the agent say "ah, meat" after the visitor picked bean and meat.
   */
  it("names every food picked within one debounce window", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean"])} />);
    // Second pick lands before the first reaction fires, cancelling it.
    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean", "Meat"])} />);

    expect(mockInterruptAndRespond).not.toHaveBeenCalled();

    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).toHaveBeenCalledTimes(1);
    expect(lastMessage()).toContain("Bean");
    expect(lastMessage()).toContain("Meat");
  });

  /** Once reported, a food is no longer news — only the new pick is. */
  it("reports only what changed since the last delivered reaction", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean"])} />);
    act(() => { vi.runAllTimers(); });

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean", "Meat"])} />);
    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).toHaveBeenCalledTimes(2);
    expect(lastMessage()).toContain("Meat");
    expect(lastMessage()).not.toContain("added Bean");
  });

  /** Picking and unpicking inside one window leaves nothing worth saying. */
  it("stays silent when the council ends up unchanged", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean"])} />);
    rerender(<MeetingSetupAgent
      {...defaultProps}
      lastUserEvent={{ type: "character_deselected", selectedNames: [], chairName: "Water", isFull: false }}
    />);

    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).not.toHaveBeenCalled();
  });

  /**
   * Arriving with foods already chosen (e.g. back from the topic step) must not
   * replay them as if they were just picked.
   */
  it("treats foods already selected on arrival as known", () => {
    mockSelectedCharacters.value = ["chair", "bean"];

    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean", "Meat"])} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage()).toContain("Meat");
    expect(lastMessage()).not.toContain("added Bean");
  });

  /** The UI blocks a 7th pick, so this is the only moment to tell the agent. */
  it("mentions the council is full when the pick fills the last slot", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean"], true)} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage().toLowerCase()).toContain("full");
  });

  it("says nothing about being full while there is still room", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Bean"], false)} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage().toLowerCase()).not.toContain("full");
  });
});
