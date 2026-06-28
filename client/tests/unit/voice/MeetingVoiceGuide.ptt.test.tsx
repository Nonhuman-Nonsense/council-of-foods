import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import MeetingVoiceGuide from "@voice/MeetingVoiceGuide";

const mockClaim = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockSetLed = vi.hoisted(() => vi.fn());
const mockPressed = vi.hoisted(() => ({ value: false }));
const mockUseVoiceGuide = vi.hoisted(() => vi.fn(() => ({
  isConnecting: false,
  error: null,
  lastCaption: null,
  lastUserTranscript: null,
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
    pushToTalkMode: true,
    setPushToTalkMode: vi.fn(),
  })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
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
      pushToTalkMode: true,
      setPushToTalkMode: vi.fn(),
    });
  });

  it("claims the button in web mode when push-to-talk is on (not museum-only)", () => {
    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockClaim).toHaveBeenCalled();
    expect(mockSetLed).toHaveBeenCalledWith(expect.any(String));
  });

  it("passes pressed state to useVoiceGuide micOpen in web mode", () => {
    mockPressed.value = true;

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseVoiceGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        pushToTalkMode: true,
        micOpen: true,
      }),
    );
  });

  it("still claims the button in museum mode with push-to-talk", () => {
    mockUseCouncilSettings.mockReturnValue({
      isMuseumMode: true,
      mode: "museum",
      setAppMode: vi.fn(),
      pushToTalkMode: true,
      setPushToTalkMode: vi.fn(),
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
      error: null,
      lastCaption: null,
      lastUserTranscript: null,
      muted: false,
      setMuted: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      sendUserMessage: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);
    expect(mockSetLed).toHaveBeenCalledWith("off");
  });

  it("does not claim the button when push-to-talk is off", () => {
    mockUseCouncilSettings.mockReturnValue({
      isMuseumMode: false,
      mode: "web",
      setAppMode: vi.fn(),
      pushToTalkMode: false,
      setPushToTalkMode: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockSetLed).not.toHaveBeenCalled();
  });
});
