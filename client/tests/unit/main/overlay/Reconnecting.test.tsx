import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Reconnecting from "@main/overlay/Reconnecting";
import { useErrorStore } from "@main/overlay/errorStore";

const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn(() => ({ isMuseumMode: false })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/utils", () => ({ useMobile: () => false }));
vi.mock("@/settings/councilSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/settings/councilSettings")>();
  return {
    ...actual,
    useCouncilSettings: () => mockUseCouncilSettings(),
    getAppMode: () => (mockUseCouncilSettings().isMuseumMode ? "museum" : "web"),
  };
});
vi.mock("@main/Loading", () => ({
  default: () => <div data-testid="loading-spinner" />,
}));

/** Museum kiosks: probe /health before hard-restart — keep in sync with Reconnecting.tsx */
const MUSEUM_RECONNECTING_RESTART_MS = 2 * 60 * 1000;

describe("Reconnecting overlay", () => {
  beforeEach(() => {
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: false });
    useErrorStore.getState().resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the connection-error heading, sub-text and spinner", () => {
    render(<Reconnecting />);
    expect(screen.getByText("error.connection")).toBeInTheDocument();
    expect(screen.getByText("error.reconnecting")).toBeInTheDocument();
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("does not start a reload timer in web mode", () => {
    vi.useFakeTimers();
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    render(<Reconnecting />);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(hrefSetter).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("museum: escalates via reloadApp when health is not OK", async () => {
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

    render(<Reconnecting />);

    await act(async () => {
      vi.advanceTimersByTime(MUSEUM_RECONNECTING_RESTART_MS);
      await Promise.resolve();
    });

    expect(hrefSetter).not.toHaveBeenCalled();
    expect(useErrorStore.getState().unrecoverableError).toMatchObject({
      source: "reload",
    });
  });

  it("museum: reloads when health probe succeeds after waiting phase", async () => {
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

    render(<Reconnecting />);

    await act(async () => {
      vi.advanceTimersByTime(MUSEUM_RECONNECTING_RESTART_MS);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(hrefSetter).toHaveBeenCalledWith("/");
  });

  it("museum: cancels reload timer on unmount", async () => {
    vi.useFakeTimers();
    mockUseCouncilSettings.mockReturnValue({ isMuseumMode: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise(() => {
            void init;
          }),
      ),
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

    const { unmount } = render(<Reconnecting />);

    await act(async () => {
      vi.advanceTimersByTime(MUSEUM_RECONNECTING_RESTART_MS);
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(hrefSetter).not.toHaveBeenCalled();
  });
});
