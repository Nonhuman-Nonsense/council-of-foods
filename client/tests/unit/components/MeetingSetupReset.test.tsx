import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import type { Topic } from "@shared/ModelTypes";
import MeetingSetupShell from "@newMeeting/MeetingSetupShell";
import Main from "@main/Main";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";
import routes from "@/routes.json";
import { MockFactory } from "../factories/MockFactory";

const resetTopic = MockFactory.createTopic({ id: "new-topic", title: "New Topic" });

vi.mock("@voice/MeetingVoiceGuide", () => ({
  default: () => null,
}));

vi.mock("@/routing", () => ({
  useRouting: () => ({
    rootPath: "/",
    newMeetingPath: `/${routes.newMeeting}`,
    meetingPath: (id: number) => `/${routes.meeting}/${id}`,
    meetingRoutesBase: `/${routes.meeting}`,
  }),
  isRootPath: (pathname: string) => pathname === "/" || pathname === "",
  isMeetingPath: (pathname: string) =>
    pathname === `/${routes.meeting}` || pathname.startsWith(`/${routes.meeting}/`),
  stripLanguagePrefix: (pathname: string) => pathname,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@main/overlay/Overlay", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@main/overlay/MainOverlays", () => ({
  default: ({ onReset }: { onReset: (topic?: Topic) => void }) => (
    <button
      type="button"
      data-testid="reset-with-topic"
      onClick={() => onReset(resetTopic)}
    >
      reset with topic
    </button>
  ),
}));

vi.mock("@newMeeting/Landing", () => ({
  default: () => <div data-testid="landing">Landing</div>,
}));

vi.mock("@main/Navbar", () => ({
  default: () => <nav>Navbar</nav>,
}));

vi.mock("@newMeeting/SelectTopic", () => ({
  default: () => <div data-testid="select-topic">SelectTopic</div>,
}));

vi.mock("@newMeeting/SelectCharacters", () => ({
  default: () => <div data-testid="select-characters">SelectCharacters</div>,
  createDefaultHumans: () => [
    MockFactory.createPanelist(0),
    MockFactory.createPanelist(1),
    MockFactory.createPanelist(2),
  ],
  getCharacterSetupBundle: () => MockFactory.createCharacterSetupBundle(),
}));

vi.mock("@council/Council", () => ({
  default: () => <div data-testid="council">Council</div>,
}));

vi.mock("@main/overlay/RotateDevice", () => ({
  default: () => null,
}));

vi.mock("@main/FullscreenButton", () => ({
  default: () => null,
}));

vi.mock("@/museum/MuseumModeEscapeHatch", () => ({
  default: () => null,
}));

vi.mock("@/utils", () => ({
  usePortrait: () => false,
  useMobile: () => false,
  useMobileXs: () => false,
  useDocumentVisibility: () => true,
  dvh: "vh",
  minWindowHeight: 300,
  filename: (str: string) => str,
  toTitleCase: (str: string) => str,
  capitalizeFirstLetter: (str: string) => str,
}));

vi.mock("@shared/prompts/topics_en.json", () => ({
  default: {
    topics: [{ id: "new-topic", title: "New Topic", description: "D", prompt: "P" }],
    custom_topic: { id: "customtopic", title: "Custom", description: "C", prompt: "Custom" },
    system: "System [TOPIC]",
  },
}));

function MeetingSetupShellHarness({ topicSelection = null }: { topicSelection?: Topic | null }) {
  return (
    <MeetingSetupShell
      setUnrecoverableError={() => {}}
      topicSelection={topicSelection}
      setTopicSelection={() => {}}
      setMeetingliveKey={() => {}}
    />
  );
}

function RootNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/");
  }, [navigate]);
  return null;
}

describe("Meeting setup reset on navigation", () => {
  beforeEach(() => {
    useMeetingSetupStore.getState().resetStore();
  });

  it("clears persisted setup state when MeetingSetupShell reaches root", async () => {
    useMeetingSetupStore.getState().setSelectedCharacters([CHAIR_ID, "food-a", "food-b"]);
    useMeetingSetupStore.getState().setSelectedTopic("old-topic");
    useMeetingSetupStore.getState().setVisitorName("Alex");

    render(
      <MemoryRouter initialEntries={[`/${routes.newMeeting}`]}>
        <Routes>
          <Route
            path={`/${routes.newMeeting}`}
            element={
              <>
                <MeetingSetupShellHarness />
                <RootNavigator />
              </>
            }
          />
          <Route path="/" element={<MeetingSetupShellHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useMeetingSetupStore.getState().selectedCharacters).toEqual([CHAIR_ID]);
    });
    expect(useMeetingSetupStore.getState().selectedTopic).toBe("");
    expect(useMeetingSetupStore.getState().visitorName).toBe("");
  });

  it("clears character selection but keeps the new topic after settings topic reset", async () => {
    useMeetingSetupStore.getState().setSelectedCharacters([CHAIR_ID, "food-a", "food-b", "food-c"]);
    useMeetingSetupStore.getState().setSelectedTopic("old-topic");

    render(
      <MemoryRouter initialEntries={[`/${routes.meeting}/42`]}>
        <Main lang="en" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("reset-with-topic"));

    await waitFor(() => {
      expect(screen.getByTestId("select-characters")).toBeInTheDocument();
    });

    const store = useMeetingSetupStore.getState();
    expect(store.selectedCharacters).toEqual([CHAIR_ID]);
    expect(store.selectedTopic).toBe("new-topic");
  });

  it("starts with a clean setup store after navigating from meeting to root", async () => {
    useMeetingSetupStore.getState().setSelectedCharacters([CHAIR_ID, "food-a", "food-b"]);
    useMeetingSetupStore.getState().setSelectedTopic("old-topic");

    function MeetingNavigator() {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/");
      }, [navigate]);
      return <div data-testid="meeting">Meeting</div>;
    }

    render(
      <MemoryRouter initialEntries={[`/${routes.meeting}/42`]}>
        <Routes>
          <Route path={`/${routes.meeting}/:meetingId`} element={<MeetingNavigator />} />
          <Route path="/" element={<MeetingSetupShellHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useMeetingSetupStore.getState().selectedCharacters).toEqual([CHAIR_ID]);
    });
    expect(useMeetingSetupStore.getState().selectedTopic).toBe("");
  });
});
