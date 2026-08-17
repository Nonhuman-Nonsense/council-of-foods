import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MeetingSetupAgent from "@setupAgent/MeetingSetupAgent";
import type { AppMode } from "@/settings/councilSettings";
import { capabilitiesFor, type Capabilities } from "@/settings/capabilities";

const mockClaim = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockSetArmed = vi.hoisted(() => vi.fn());
const mockToggleLatch = vi.hoisted(() => vi.fn());
const mockPressed = vi.hoisted(() => ({ value: false }));
const mockUseSetupAgent = vi.hoisted(() => vi.fn((_params?: unknown) => ({
  isConnecting: false,
  lastCaption: null,
  lastUserTranscript: null,
  micStream: null,
  muted: false,
  setMuted: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  sendUserMessage: vi.fn(),
})));
const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn((): {
    isMuseumMode: boolean;
    mode: AppMode;
    setAppMode: () => void;
    capabilities: Capabilities;
  } => ({
    isMuseumMode: true,
    mode: "museum",
    setAppMode: vi.fn(),
    capabilities: capabilitiesFor("museum"),
  })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/navigation", () => ({
  useSwitchLanguage: () => ({ switchLanguage: vi.fn(), otherLanguages: [] }),
}));

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => mockUseCouncilSettings(),
  getAppMode: () => "web",
}));

vi.mock("@/museum/button/useButton", () => ({
  useButton: () => ({
    claim: mockClaim,
    release: mockRelease,
    setArmed: mockSetArmed,
    toggleLatch: mockToggleLatch,
    pressed: mockPressed.value,
    wantsMic: mockPressed.value,
    isOwner: true,
  }),
}));

vi.mock("@setupAgent/useSetupAgent", () => ({
  useSetupAgent: (params: unknown) => mockUseSetupAgent(params),
}));

vi.mock("@setupAgent/SetupAgentOverlay", () => ({
  default: (props: { onToggleMic?: () => void }) => (
    <button type="button" data-testid="mic-toggle" onClick={props.onToggleMic} />
  ),
}));

vi.mock("@main/Loading", () => ({
  default: () => null,
}));

vi.mock("@newMeeting/meetingSetupStore", () => ({
  useMeetingSetupStore: () => ({
    selectedTopic: null,
    customTopic: "",
    visitorName: "",
  }),
}));

/**
 * `vi.clearAllMocks()` clears calls but not implementations, so a test that
 * overrides the agent state has to be undone explicitly — otherwise it leaks
 * into every test after it.
 */
function agentState(overrides: Record<string, unknown> = {}) {
  return {
    isConnecting: false,
    lastCaption: null,
    lastUserTranscript: null,
    micStream: null,
    muted: false,
    setMuted: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    sendUserMessage: vi.fn(),
    ...overrides,
  };
}

const defaultProps = {
  phase: "topic" as const,
  lastUserEvent: null,
  onBeginSetup: vi.fn(),
  onGoToTopicStep: vi.fn(),
  onSelectTopic: vi.fn(),
  onStartMeeting: vi.fn(),
};

describe("MeetingSetupAgent button ownership", () => {
  function settings(mode: AppMode) {
    return {
      isMuseumMode: mode === "museum",
      mode,
      setAppMode: vi.fn(),
      capabilities: capabilitiesFor(mode),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPressed.value = false;
    mockUseSetupAgent.mockReturnValue(agentState());
    mockUseCouncilSettings.mockReturnValue(settings("museum"));
  });

  it("claims the button in museum mode", () => {
    render(<MeetingSetupAgent {...defaultProps} />);

    expect(mockClaim).toHaveBeenCalled();
    expect(mockSetArmed).toHaveBeenCalledWith(true);
  });

  it("takes the mic up front in museum, and passes the press through", () => {
    mockPressed.value = true;

    render(<MeetingSetupAgent {...defaultProps} />);

    expect(mockUseSetupAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        micUpFront: true,
        micOpen: true,
      }),
    );
  });

  it("stays armed while pressed — arming does not follow the press", () => {
    mockPressed.value = true;
    render(<MeetingSetupAgent {...defaultProps} />);
    expect(mockSetArmed).toHaveBeenCalledWith(true);
  });

  it("disarms while the agent is connecting and cannot take a voice", () => {
    mockUseSetupAgent.mockReturnValue(agentState({ isConnecting: true }));

    render(<MeetingSetupAgent {...defaultProps} />);
    expect(mockSetArmed).toHaveBeenCalledWith(false);
  });

  it("claims and arms the button in web mode too — space works there now", () => {
    mockUseCouncilSettings.mockReturnValue(settings("web"));

    render(<MeetingSetupAgent {...defaultProps} />);

    expect(mockClaim).toHaveBeenCalled();
    expect(mockSetArmed).toHaveBeenCalledWith(true);
  });

  it("routes the on-screen mic button through the same latch as a tap", () => {
    mockUseCouncilSettings.mockReturnValue(settings("web"));
    const start = vi.fn();
    mockUseSetupAgent.mockReturnValue(agentState({ start }));

    render(<MeetingSetupAgent {...defaultProps} />);
    fireEvent.click(screen.getByTestId("mic-toggle"));

    expect(mockToggleLatch).toHaveBeenCalledOnce();
    // Already running, so nothing to wake.
    expect(start).not.toHaveBeenCalled();
  });

  it("wakes a switched-off agent from the mic button, then latches", () => {
    // Wanting to talk implies wanting to hear the reply.
    mockUseCouncilSettings.mockReturnValue(settings("web"));
    const start = vi.fn();
    mockUseSetupAgent.mockReturnValue(agentState({ muted: true, start }));

    render(<MeetingSetupAgent {...defaultProps} />);
    fireEvent.click(screen.getByTestId("mic-toggle"));

    expect(start).toHaveBeenCalledOnce();
    expect(mockToggleLatch).toHaveBeenCalledOnce();
  });

  it("defers the mic in web mode", () => {
    mockUseCouncilSettings.mockReturnValue(settings("web"));

    render(<MeetingSetupAgent {...defaultProps} />);

    expect(mockUseSetupAgent).toHaveBeenCalledWith(
      expect.objectContaining({ micUpFront: false }),
    );
  });
});
