import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import AutoplayCoordinator from "@/autoplay/AutoplayCoordinator";
import {
  _setAutoplayLastActivityMsForTests,
  AUTOPLAY_NEXT_MEETING_MS,
  SETUP_IDLE_MS,
  notifyAutoplay,
  useAutoplayStore,
} from "@/autoplay/autoplayStore";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import { setConnectionError, setUnrecoverableError, useErrorStore } from "@main/overlay/errorStore";

const mockNavigate = vi.fn();
const mockLocation = vi.hoisted(() => ({
  pathname: "/",
  hash: "",
}));

const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn(() => ({
    isMuseumMode: true,
  })),
);

const buttonPressed = vi.hoisted(() => ({ value: false }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLocation: () => mockLocation,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => mockUseCouncilSettings(),
  getDevLogEnabled: () => false,
  isDevLogCategoryEnabled: () => false,
  getAppMode: () => (mockUseCouncilSettings().isMuseumMode ? "museum" : "web"),
}));

vi.mock("@/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/navigation")>("@/navigation");
  return {
    ...actual,
    useRouting: () => ({
      rootPath: "/",
      newMeetingPath: "/new",
      meetingPath: (meetingId: number) => `/meeting/${meetingId}`,
      meetingRoutesBase: "/meeting",
    }),
  };
});

vi.mock("@/museum/button/useButton", () => ({
  useButton: () => ({
    claim: vi.fn(),
    release: vi.fn(),
    setLed: vi.fn(),
    get pressed() {
      return buttonPressed.value;
    },
    isOwner: false,
  }),
}));

const mockFetchAutoplayMeetingId = vi.hoisted(() => vi.fn().mockResolvedValue(99));

vi.mock("@api/fetchAutoplayMeeting", () => ({
  fetchAutoplayMeetingId: mockFetchAutoplayMeetingId,
}));

const mockChangeLanguage = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", changeLanguage: mockChangeLanguage },
    t: (key: string) => key,
  }),
}));

vi.mock("@main/overlay/Overlay", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderCoordinator(props?: Partial<ComponentProps<typeof AutoplayCoordinator>>) {
  return render(
    <MemoryRouter>
      <AutoplayCoordinator
        meetingliveKey={props?.meetingliveKey ?? null}
        setMeetingliveKey={props?.setMeetingliveKey ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

async function advanceIdlePastThreshold(): Promise<void> {
  _setAutoplayLastActivityMsForTests(Date.now() - SETUP_IDLE_MS - 500);
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
}

describe("AutoplayCoordinator setup-entry idle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mockLocation.pathname = "/";
    mockLocation.hash = "";
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true });
    buttonPressed.value = false;
    useAutoplayStore.getState().resetForTests();
    useErrorStore.getState().resetForTests();
    _resetButtonStoreForTests();
    useButtonStore.setState({ claims: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing outside museum mode", () => {
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: false });
    const { container } = renderCoordinator();
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["/", "/en", "/new", "/en/new"])("shows warning after idle on %s", async (pathname) => {
    mockLocation.pathname = pathname;
    renderCoordinator();

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("warning");
    expect(screen.getByText("autoplay.stillThere.title")).toBeTruthy();
  });

  it("does not show warning on a live meeting route", async () => {
    mockLocation.pathname = "/meeting/42";
    renderCoordinator({ meetingliveKey: "live-key" });

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("off");
  });

  it("does not show warning while staff #staff overlay is open", async () => {
    mockLocation.hash = "#staff";
    renderCoordinator();

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("off");
  });

  it("does not show warning while staff panel owns the button", async () => {
    useButtonStore.setState({ claims: { staff: true } });
    renderCoordinator();

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("off");
  });

  it("does not show warning when autoplay phase is already active", async () => {
    useAutoplayStore.getState().setPhase("active");
    renderCoordinator();

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("active");
  });

  it("resets idle countdown after activity bump", async () => {
    renderCoordinator();

    _setAutoplayLastActivityMsForTests(Date.now() - SETUP_IDLE_MS - 500);
    useAutoplayStore.getState().bumpActivity("button-press");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(useAutoplayStore.getState().phase).toBe("off");
  });

  it("enters autoplay using getPreferredLanguage for fetch and navigation", async () => {
    window.__COF_BOOTSTRAP__ = { preferredLang: "de" };
    renderCoordinator();

    await advanceIdlePastThreshold();
    await act(async () => {
      screen.getByText("autoplay.stillThere.confirm").click();
    });

    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
    expect(mockFetchAutoplayMeetingId).toHaveBeenCalledWith("en");
    expect(mockNavigate).toHaveBeenCalledWith("/meeting/99", { replace: true });
    expect(useAutoplayStore.getState().meetingGeneration).toBe(1);
  });

  it("surfaces autoplay fetch failure via unrecoverable error", async () => {
    mockFetchAutoplayMeetingId.mockRejectedValueOnce(new Error("Autoplay meeting failed (404)"));
    renderCoordinator();

    await advanceIdlePastThreshold();
    await act(async () => {
      screen.getByText("autoplay.stillThere.confirm").click();
    });

    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      message: "Autoplay meeting failed (404)",
      source: "autoplay",
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("increments meetingGeneration when loop fetches the same meeting id", async () => {
    mockLocation.pathname = "/meeting/99";
    mockFetchAutoplayMeetingId.mockResolvedValue(99);
    useAutoplayStore.getState().setPhase("active");
    notifyAutoplay({ type: "council-state", state: "summary" });
    notifyAutoplay({ type: "summary-playback-finished" });

    renderCoordinator();

    await act(async () => {
      vi.advanceTimersByTime(AUTOPLAY_NEXT_MEETING_MS);
    });

    expect(mockNavigate).toHaveBeenCalledWith("/meeting/99", { replace: true });
    expect(useAutoplayStore.getState().meetingGeneration).toBe(1);
  });

  it("does not show warning while unrecoverable error is set", async () => {
    setUnrecoverableError({ message: "boom", source: "test" });
    renderCoordinator();

    await advanceIdlePastThreshold();

    expect(useAutoplayStore.getState().phase).toBe("off");
    expect(screen.queryByText("autoplay.stillThere.title")).not.toBeInTheDocument();
  });

  it("clears warning when connection error appears", async () => {
    renderCoordinator();

    await advanceIdlePastThreshold();
    expect(useAutoplayStore.getState().phase).toBe("warning");

    await act(async () => {
      setConnectionError("socket", true);
    });

    expect(useAutoplayStore.getState().phase).toBe("off");
    expect(screen.queryByText("autoplay.stillThere.title")).not.toBeInTheDocument();
  });

  it("clears warning when unrecoverable error appears", async () => {
    renderCoordinator();

    await advanceIdlePastThreshold();
    expect(useAutoplayStore.getState().phase).toBe("warning");

    await act(async () => {
      setUnrecoverableError({ message: "boom", source: "test" });
    });

    expect(useAutoplayStore.getState().phase).toBe("off");
    expect(screen.queryByText("autoplay.stillThere.title")).not.toBeInTheDocument();
  });

  it("museum exit escalates to reload error when health probe fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    useAutoplayStore.getState().setPhase("active");
    const view = renderCoordinator();

    buttonPressed.value = true;
    view.rerender(
      <MemoryRouter>
        <AutoplayCoordinator meetingliveKey={null} setMeetingliveKey={vi.fn()} />
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(useAutoplayStore.getState().phase).toBe("off");
    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      source: "reload",
    });
  });
});
