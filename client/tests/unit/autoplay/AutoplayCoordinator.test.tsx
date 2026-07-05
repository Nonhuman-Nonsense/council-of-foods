import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter } from "react-router";
import AutoplayCoordinator from "@/autoplay/AutoplayCoordinator";
import {
  _setAutoplayLastActivityMsForTests,
  SETUP_IDLE_MS,
  useAutoplayStore,
} from "@/autoplay/autoplayStore";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import { useErrorStore } from "@main/overlay/errorStore";

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
}));

vi.mock("@/routing", async () => {
  const actual = await vi.importActual<typeof import("@/routing")>("@/routing");
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
    pressed: false,
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
  });
});
