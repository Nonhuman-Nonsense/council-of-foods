import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import MeetingVoiceGuide from "@voice/MeetingVoiceGuide";

const mockClaim = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockSetLed = vi.hoisted(() => vi.fn());
const mockPressed = vi.hoisted(() => ({ value: false }));
const mockUseVoiceGuide = vi.hoisted(() => vi.fn(() => ({
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
  vi.fn(() => ({
    isMuseumMode: false,
    mode: "web" as const,
    setAppMode: vi.fn(),
    agentMode: "ptt" as const,
    setAgentMode: vi.fn(),
  })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/routing", () => ({
  useSwitchLanguage: () => ({ switchLanguage: vi.fn(), otherLanguages: [] }),
}));

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => mockUseCouncilSettings(),
}));

vi.mock("@/museum/button/useButton", () => ({
  useButton: () => ({
    claim: mockClaim,
    release: mockRelease,
    setLed: mockSetLed,
    pressed: mockPressed.value,
    isOwner: true,
  }),
}));

vi.mock("@voice/useVoiceGuide", () => ({
  useVoiceGuide: (params: unknown) => mockUseVoiceGuide(params),
}));

vi.mock("@voice/VoiceGuideOverlay", () => ({
  default: () => null,
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

const defaultProps = {
  phase: "topic" as const,
  lastUserEvent: null,
  onBeginSetup: vi.fn(),
  onGoToTopicStep: vi.fn(),
  onSelectTopic: vi.fn(),
  onStartMeeting: vi.fn(),
};

describe("MeetingVoiceGuide PTT (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPressed.value = false;
    mockUseCouncilSettings.mockReturnValue({
      isMuseumMode: false,
      mode: "web",
      setAppMode: vi.fn(),
      agentMode: "ptt",
      setAgentMode: vi.fn(),
    });
  });

  it("claims the button in web mode when agent mode is ptt (not museum-only)", () => {
    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockClaim).toHaveBeenCalled();
    expect(mockSetLed).toHaveBeenCalledWith(expect.any(String));
  });

  it("passes pressed state to useVoiceGuide micOpen in web mode", () => {
    mockPressed.value = true;

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseVoiceGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMode: "ptt",
        micOpen: true,
      }),
    );
  });

  it("still claims the button in museum mode with ptt", () => {
    mockUseCouncilSettings.mockReturnValue({
      isMuseumMode: true,
      mode: "museum",
      setAppMode: vi.fn(),
      agentMode: "ptt",
      setAgentMode: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockClaim).toHaveBeenCalled();
    expect(mockSetLed).toHaveBeenCalledWith(expect.any(String));
  });

  it("sets LED pulse when ready and not pressed", () => {
    render(<MeetingVoiceGuide {...defaultProps} />);
    expect(mockSetLed).toHaveBeenCalledWith("pulse");
  });

  it("sets LED on while pressed", () => {
    mockPressed.value = true;
    render(<MeetingVoiceGuide {...defaultProps} />);
    expect(mockSetLed).toHaveBeenCalledWith("on");
  });

  it("sets LED off when voice is connecting", () => {
    mockUseVoiceGuide.mockReturnValue({
      isConnecting: true,
      lastCaption: null,
      lastUserTranscript: null,
      micStream: null,
      muted: false,
      setMuted: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      sendUserMessage: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);
    expect(mockSetLed).toHaveBeenCalledWith("off");
  });

  it("does not claim the button when agent mode is always-on", () => {
    mockUseCouncilSettings.mockReturnValue({
      isMuseumMode: false,
      mode: "web",
      setAppMode: vi.fn(),
      agentMode: "always-on",
      setAgentMode: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSetLed).not.toHaveBeenCalled();
  });
});
