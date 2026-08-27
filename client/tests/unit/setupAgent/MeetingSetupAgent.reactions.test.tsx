import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { act } from "react";
import MeetingSetupAgent from "@setupAgent/MeetingSetupAgent";
import type { MeetingSetupUserEvent } from "@newMeeting/meetingSetup";
import { capabilitiesFor } from "@/settings/capabilities";

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
    capabilities: capabilitiesFor("web"),
  }),
  getAppMode: () => "web",
}));

vi.mock("@/museum/button/useButton", () => ({
  useButton: () => ({ claim: vi.fn(), release: vi.fn(), setArmed: vi.fn(), pressed: false, wantsMic: false, isOwner: true }),
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

// Fake, product-neutral roster: this suite must pass identically whichever
// real character set (foods, forest beings, ...) is checked out. A real id
// resolves fine against the real bundle, but the *name* differs per product,
// which is exactly the coupling this mock removes.
vi.mock("@newMeeting/CharacterSetup", () => ({
  CHAIR_ID: "chair",
  getCharacterSetupBundle: () => ({
    characters: [
      { id: "chair", name: "Chair" },
      { id: "alpha", name: "Alpha" },
      { id: "beta", name: "Beta" },
    ],
  }),
}));

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

/** The chair is always selected; characters are what the visitor picks. */
function councilEvent(selectedNames: string[], isFull = false): MeetingSetupUserEvent {
  return { type: "character_selected", selectedNames, chairName: "Chair", isFull };
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
   * The reaction is debounced, so picking two characters quickly delivers a
   * single message. It has to name both — reacting only to the last one is
   * what made the agent say "ah, beta" after the visitor picked alpha and beta.
   */
  it("names every character picked within one debounce window", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha"])} />);
    // Second pick lands before the first reaction fires, cancelling it.
    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha", "Beta"])} />);

    expect(mockInterruptAndRespond).not.toHaveBeenCalled();

    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).toHaveBeenCalledTimes(1);
    expect(lastMessage()).toContain("Alpha");
    expect(lastMessage()).toContain("Beta");
  });

  /** Once reported, a character is no longer news — only the new pick is. */
  it("reports only what changed since the last delivered reaction", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha"])} />);
    act(() => { vi.runAllTimers(); });

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha", "Beta"])} />);
    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).toHaveBeenCalledTimes(2);
    expect(lastMessage()).toContain("Beta");
    expect(lastMessage()).not.toContain("added Alpha");
  });

  /** Picking and unpicking inside one window leaves nothing worth saying. */
  it("stays silent when the council ends up unchanged", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha"])} />);
    rerender(<MeetingSetupAgent
      {...defaultProps}
      lastUserEvent={{ type: "character_deselected", selectedNames: [], chairName: "Chair", isFull: false }}
    />);

    act(() => { vi.runAllTimers(); });

    expect(mockInterruptAndRespond).not.toHaveBeenCalled();
  });

  /**
   * Arriving with characters already chosen (e.g. back from the topic step)
   * must not replay them as if they were just picked.
   */
  it("treats characters already selected on arrival as known", () => {
    // Ids from the mocked bundle above, not a real product's — a name the
    // bundle doesn't know resolves to nothing, and the agent would be told
    // about a pick the visitor actually made a step ago.
    mockSelectedCharacters.value = ["chair", "alpha"];

    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha", "Beta"])} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage()).toContain("Beta");
    expect(lastMessage()).not.toContain("added Alpha");
  });

  /** The UI blocks a 7th pick, so this is the only moment to tell the agent. */
  it("mentions the council is full when the pick fills the last slot", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha"], true)} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage().toLowerCase()).toContain("full");
  });

  it("says nothing about being full while there is still room", () => {
    const { rerender } = render(<MeetingSetupAgent {...defaultProps} />);

    rerender(<MeetingSetupAgent {...defaultProps} lastUserEvent={councilEvent(["Alpha"], false)} />);
    act(() => { vi.runAllTimers(); });

    expect(lastMessage().toLowerCase()).not.toContain("full");
  });
});
