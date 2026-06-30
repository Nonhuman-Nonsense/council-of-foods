import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AutoplayWarning, { AUTOPLAY_WARNING_TIMEOUT_SECONDS } from "@main/overlay/AutoplayWarning";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AutoplayWarning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
  });

  it("calls onConfirm when the countdown elapses", () => {
    const onConfirm = vi.fn();
    render(<AutoplayWarning onConfirm={onConfirm} />);

    expect(screen.getByText("autoplay.stillThere.title")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AUTOPLAY_WARNING_TIMEOUT_SECONDS * 1000);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when the button is clicked", () => {
    const onConfirm = vi.fn();
    render(<AutoplayWarning onConfirm={onConfirm} />);

    screen.getByText("autoplay.stillThere.confirm").click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
