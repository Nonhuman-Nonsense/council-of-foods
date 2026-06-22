import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import MeetingVoiceGuide from "@voice/MeetingVoiceGuide";

const mockUseButtonLed = vi.hoisted(() => vi.fn());
const mockUseButtonPressed = vi.hoisted(() => vi.fn(() => false));
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
const mockUseAppMode = vi.hoisted(() =>
  vi.fn(() => ({ isMuseumMode: false, mode: "web" as const, setAppMode: vi.fn() })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@/museum/useAppMode", () => ({
  useAppMode: () => mockUseAppMode(),
}));

vi.mock("@/settings/councilSettings", () => ({
  getPushToTalk: vi.fn(() => true),
}));

vi.mock("@/museum/button/hooks", () => ({
  useButtonLed: (...args: unknown[]) => mockUseButtonLed(...args),
  useButtonPressed: (active: boolean) => mockUseButtonPressed(active),
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

vi.mock("@main/topicsBundle", () => ({
  getTopicsBundle: () => ({
    topics: [{ id: "forests", title: "Forests", description: "D", prompt: "P" }],
    custom_topic: { id: "custom", title: "Custom", description: "", prompt: "" },
  }),
}));

vi.mock("@newMeeting/CharacterSetup", () => ({
  getCharacterSetupBundle: () => ({
    characters: [{ id: "water", name: "Water", description: "", prompt: "", voice: "" }],
  }),
}));

vi.mock("@voice/guidePrompt", () => ({
  buildGuidePrompt: () => "mock instructions",
}));

vi.mock("@voice/guideTools", () => ({
  createGuideTools: () => [],
  createGuideToolHandlers: () => ({}),
}));

vi.mock("@voice/voiceGuideBundle", () => ({
  getVoiceGuideBundle: () => ({
    system: "test",
    projectDescription: "test",
    characterVocabulary: { singular: "food", plural: "foods", stepLabel: "foods" },
    landingJobInstructions: [],
    landingJobInstructionsPushToTalk: [],
    jobInstructions: [],
    toolDescriptions: {},
  }),
}));

const defaultProps = {
  phase: "landing" as const,
  lastUserEvent: null,
  onBeginSetup: vi.fn(),
  onGoToTopicStep: vi.fn(),
  onSelectTopic: vi.fn(),
  onStartMeeting: vi.fn(),
};

describe("MeetingVoiceGuide PTT (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppMode.mockReturnValue({
      isMuseumMode: false,
      mode: "web",
      setAppMode: vi.fn(),
    });
    mockUseButtonPressed.mockImplementation((active: boolean) => active);
  });

  it("enables button hooks in web mode when push-to-talk is on (not museum-only)", () => {
    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseButtonPressed).toHaveBeenCalledWith(true);
    expect(mockUseButtonLed).toHaveBeenCalledWith(
      "voice-guide",
      expect.any(String),
      true,
    );
  });

  it("passes pressed state to useVoiceGuide micOpen in web mode", () => {
    mockUseButtonPressed.mockReturnValue(true);

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseVoiceGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        pushToTalkMode: true,
        micOpen: true,
      }),
    );
  });

  it("still enables button hooks in museum mode with push-to-talk", () => {
    mockUseAppMode.mockReturnValue({
      isMuseumMode: true,
      mode: "museum",
      setAppMode: vi.fn(),
    });

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseButtonPressed).toHaveBeenCalledWith(true);
    expect(mockUseButtonLed).toHaveBeenCalledWith(
      "voice-guide",
      expect.any(String),
      true,
    );
  });

  it("disables button hooks when push-to-talk is off", async () => {
    const { getPushToTalk } = await import("@/settings/councilSettings");
    vi.mocked(getPushToTalk).mockReturnValue(false);
    mockUseButtonPressed.mockImplementation((active: boolean) => active);

    render(<MeetingVoiceGuide {...defaultProps} />);

    expect(mockUseButtonPressed).toHaveBeenCalledWith(false);
    expect(mockUseButtonLed).toHaveBeenCalledWith(
      "voice-guide",
      expect.any(String),
      false,
    );
  });
});
