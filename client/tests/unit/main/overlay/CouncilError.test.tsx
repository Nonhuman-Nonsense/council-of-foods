import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CouncilError from "@main/overlay/CouncilError";
import { capabilitiesFor } from "@/settings/capabilities";

const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn(() => ({ isMuseumMode: false, capabilities: capabilitiesFor("web") })),
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

vi.mock("@assets/error.png?inline", () => ({ default: "data:image/png;base64,test" }));

describe("CouncilError overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: false, capabilities: capabilitiesFor("web") });
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

  // The server names the failure; the words are ours. Its English prose is only
  // the fallback, so a translated build never shows it for a key we know.
  it("shows our own copy for a named failure, not the server's prose", () => {
    render(
      <CouncilError
        error={{ message: "This meeting is happening somewhere else", errorKey: "elsewhere", source: "test" }}
      />,
    );
    expect(screen.getByText("error.elsewhere")).toBeInTheDocument();
  });

  it("falls back to the server message for a key it does not know", () => {
    render(
      <CouncilError
        error={{ message: "Something new went wrong", errorKey: "notInvented" as never, source: "test" }}
      />,
    );
    expect(screen.getByText("Something new went wrong")).toBeInTheDocument();
  });

  // Internal prose ("state mismatch: expected awaiting_human_panelist…") is for
  // ErrorBot, never for the visitor standing in front of the screen.
  it("hides technical detail behind the generic apology", () => {
    render(
      <CouncilError
        error={{ message: "Internal state mismatch: expected awaiting_human_panelist", technical: true, source: "test" }}
      />,
    );
    expect(screen.queryByText(/Internal state mismatch/)).not.toBeInTheDocument();
    expect(screen.getByText("error.message")).toBeInTheDocument();
  });

  it("renders web restart button without probing health", () => {
    render(<CouncilError error={{ message: "boom", source: "test" }} />);

    expect(screen.getByRole("button", { name: "app.restart" })).toBeInTheDocument();
  });

  it("museum: navigates after countdown when health is OK", async () => {
    vi.useFakeTimers();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true, capabilities: capabilitiesFor("museum") });
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
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true, capabilities: capabilitiesFor("museum") });
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
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true, capabilities: capabilitiesFor("museum") });
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
