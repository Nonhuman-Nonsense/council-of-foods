import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  MUSEUM_CURSOR_HIDDEN_CLASS,
  MUSEUM_CURSOR_IDLE_MS,
  useMuseumCursorHide,
} from "@/museum/useMuseumCursorHide";

const useCouncilSettings = vi.fn();
const useLocation = vi.fn();

vi.mock("@/settings/councilSettings", () => ({
  useCouncilSettings: () => useCouncilSettings(),
}));

vi.mock("react-router", () => ({
  useLocation: () => useLocation(),
}));

function setMuseumMode(isMuseumMode: boolean, hash = ""): void {
  useCouncilSettings.mockReturnValue({ isMuseumMode });
  useLocation.mockReturnValue({ hash });
}

describe("useMuseumCursorHide", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.classList.remove(MUSEUM_CURSOR_HIDDEN_CLASS);
    setMuseumMode(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove(MUSEUM_CURSOR_HIDDEN_CLASS);
  });

  it("hides the cursor after the idle window in museum mode", () => {
    setMuseumMode(true);
    renderHook(() => useMuseumCursorHide());

    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });

    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);
  });

  it("shows the cursor on pointer movement and hides again after idle", () => {
    setMuseumMode(true);
    renderHook(() => useMuseumCursorHide());

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);

    act(() => {
      document.dispatchEvent(new Event("pointermove"));
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);
  });

  it("does nothing in web mode", () => {
    setMuseumMode(false);
    const { unmount } = renderHook(() => useMuseumCursorHide());

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);

    unmount();
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);
  });

  it("pauses hiding while #staff is open", () => {
    setMuseumMode(true, "#staff");
    renderHook(() => useMuseumCursorHide());

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);
  });

  it("cleans up when museum mode is turned off", () => {
    setMuseumMode(true);
    const { rerender } = renderHook(() => useMuseumCursorHide());

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);

    setMuseumMode(false);
    rerender();

    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);
  });

  it("starts hiding again when museum mode is turned back on", () => {
    setMuseumMode(true);
    const { rerender } = renderHook(() => useMuseumCursorHide());

    setMuseumMode(false);
    rerender();
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);

    setMuseumMode(true);
    rerender();

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);
  });

  it("removes the hidden class on unmount", () => {
    setMuseumMode(true);
    const { unmount } = renderHook(() => useMuseumCursorHide());

    act(() => {
      vi.advanceTimersByTime(MUSEUM_CURSOR_IDLE_MS);
    });
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains(MUSEUM_CURSOR_HIDDEN_CLASS)).toBe(false);
  });
});
