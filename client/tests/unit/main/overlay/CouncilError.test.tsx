import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CouncilError from "@main/overlay/CouncilError";

const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn(() => ({ isMuseumMode: false })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/navigation")>();
  return {
    ...actual,
    useRouting: () => ({ rootPath: "/" }),
  };
});

vi.mock("@/settings/councilSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/settings/councilSettings")>();
  return {
    ...actual,
    useCouncilSettings: () => mockUseCouncilSettings(),
    getAppMode: () => (mockUseCouncilSettings().isMuseumMode ? "museum" : "web"),
  };
});

vi.mock("@assets/error.png", () => ({ default: "error.png" }));

describe("CouncilError overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: false });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders web restart button without probing health", () => {
    render(<CouncilError error={{ message: "boom", source: "test" }} />);

    expect(screen.getByRole("button", { name: "app.restart" })).toBeInTheDocument();
  });

  it("museum: navigates after countdown when health is OK", async () => {
    vi.useFakeTimers();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
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

    render(<CouncilError error={{ message: "boom", source: "test" }} />);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hrefSetter).toHaveBeenCalledWith("/");
    expect(screen.getByText("error.restartUnavailableRetrying")).not.toBeVisible();
  });

  it("museum: does not navigate when health probe fails", async () => {
    vi.useFakeTimers();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true });
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

    render(<CouncilError error={{ message: "boom", source: "test" }} />);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(screen.getByText("app.restart")).toBeInTheDocument();
    expect(screen.getByText("error.restartUnavailableRetrying")).toBeInTheDocument();
  });

  it("museum: click navigates immediately without probing health", () => {
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    render(<CouncilError error={{ message: "boom", source: "test" }} />);

    fireEvent.click(screen.getByRole("button", { name: "app.restart" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hrefSetter).toHaveBeenCalledWith("/");
  });
});
