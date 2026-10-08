import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaQuery } from "react-responsive";
import { useSmallMedia } from "@/smallMedia";
import { setAppMode, type AppMode } from "@/settings/councilSettings";

vi.mock("react-responsive", () => ({ useMediaQuery: vi.fn() }));

/**
 * Staff zoom an installation's page in to fit the screen, which can push the viewport under
 * the mobile breakpoint; the stage must not drop to the small videos and background then.
 */
describe("useSmallMedia", () => {
  afterEach(() => {
    localStorage.clear();
  });

  const cases: Array<{ mode: AppMode; shortViewport: boolean; small: boolean }> = [
    { mode: "web", shortViewport: true, small: true },
    { mode: "web", shortViewport: false, small: false },
    { mode: "museum", shortViewport: true, small: false },
    { mode: "presenter", shortViewport: true, small: false },
  ];

  it.each(cases)("$mode with short viewport $shortViewport → small $small", ({ mode, shortViewport, small }) => {
    setAppMode(mode);
    vi.mocked(useMediaQuery).mockReturnValue(shortViewport);
    const { result } = renderHook(() => useSmallMedia());
    expect(result.current).toBe(small);
  });
});
