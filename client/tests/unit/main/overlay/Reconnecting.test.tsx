import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Reconnecting, { BUSY_NOTICE_DELAY_MS } from "@main/overlay/Reconnecting";
import { useErrorStore } from "@main/overlay/errorStore";
import { capabilitiesFor } from "@/settings/capabilities";

const mockUseCouncilSettings = vi.hoisted(() =>
  vi.fn(() => ({ capabilities: capabilitiesFor("web") })),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils")>();
  return { ...actual, useMobile: () => false };
});
vi.mock("@/settings/councilSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/settings/councilSettings")>();
  return {
    ...actual,
    useCouncilSettings: () => mockUseCouncilSettings(),
    getCapabilities: () => mockUseCouncilSettings().capabilities,
  };
});
vi.mock("@main/Loading", () => ({
  default: () => <div data-testid="loading-spinner" />,
}));

/** Unattended installations: probe /health before hard-restart — keep in sync with Reconnecting.tsx */
const MUSEUM_RECONNECTING_RESTART_MS = 2 * 60 * 1000;

describe("Reconnecting overlay", () => {
  beforeEach(() => {
    mockUseCouncilSettings.mockReturnValue({ capabilities: capabilitiesFor("web") });
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

  it("explains a busy provider once the wait has gone on, not before", () => {
    vi.useFakeTimers();
    render(<Reconnecting />);
    act(() => {
      useErrorStore.getState().setConnectionError("setup-agent", true, "busy");
    });

    // A squeeze that clears on the first retry needs no explaining.
    expect(screen.getByText("error.connection")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(BUSY_NOTICE_DELAY_MS);
    });
    expect(screen.getByText("error.busy")).toBeInTheDocument();
    expect(screen.getByText("error.busyRetrying")).toBeInTheDocument();
  });

  // The meta agent's overlay only appears when the visitor presses the button,
  // which can be minutes after the agent went quiet — the wait it describes has
  // already happened, so the copy must be right on the first paint.
  it("explains a busy provider immediately when the wait already outlasted the delay", () => {
    vi.useFakeTimers();
    act(() => {
      useErrorStore.getState().setConnectionError("meta-agent", true, "busy");
      vi.advanceTimersByTime(BUSY_NOTICE_DELAY_MS);
    });

    render(<Reconnecting />);
    expect(screen.getByText("error.busy")).toBeInTheDocument();
  });

  it("keeps the lost-connection copy when something is actually disconnected", () => {
    vi.useFakeTimers();
    render(<Reconnecting />);
    act(() => {
      useErrorStore.getState().setConnectionError("setup-agent", true, "busy");
      // A real drop alongside it is the more urgent truth.
      useErrorStore.getState().setConnectionError("socket", true, "lost");
      vi.advanceTimersByTime(BUSY_NOTICE_DELAY_MS);
    });

    expect(screen.getByText("error.connection")).toBeInTheDocument();
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
    mockUseCouncilSettings.mockReturnValue({ capabilities: capabilitiesFor("museum") });
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
    mockUseCouncilSettings.mockReturnValue({ capabilities: capabilitiesFor("museum") });
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
    mockUseCouncilSettings.mockReturnValue({ capabilities: capabilitiesFor("museum") });
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
