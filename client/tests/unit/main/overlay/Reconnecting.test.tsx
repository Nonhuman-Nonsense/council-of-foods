import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Reconnecting from "@main/overlay/Reconnecting";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("@/utils", () => ({ useMobile: () => false }));
vi.mock("@/routing", () => ({ useRouting: () => ({ rootPath: "/" }) }));
vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => ({ isMuseumMode: false }),
}));
vi.mock("@main/Loading", () => ({
  default: () => <div data-testid="loading-spinner" />,
}));

describe("Reconnecting overlay", () => {
  it("renders the connection-error heading", () => {
    render(<Reconnecting />);
    expect(screen.getByText("error.connection")).toBeInTheDocument();
  });

  it("renders the reconnecting sub-text", () => {
    render(<Reconnecting />);
    expect(screen.getByText("error.reconnecting")).toBeInTheDocument();
  });

  it("renders the loading spinner", () => {
    render(<Reconnecting />);
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
});
