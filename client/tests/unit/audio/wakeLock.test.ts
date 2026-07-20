import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock } from "@/audio/wakeLock";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useWakeLock", () => {
  const originalWakeLock = (navigator as { wakeLock?: unknown }).wakeLock;

  afterEach(() => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: originalWakeLock,
    });
    setVisibility("visible");
    vi.restoreAllMocks();
  });

  describe("with Wake Lock API support", () => {
    let release: ReturnType<typeof vi.fn>;
    let request: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      release = vi.fn().mockResolvedValue(undefined);
      request = vi.fn().mockResolvedValue({ release });
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: { request },
      });
    });

    it("does not request a lock while inactive", () => {
      renderHook(() => useWakeLock(false));
      expect(request).not.toHaveBeenCalled();
    });

    it("requests a screen wake lock once active", async () => {
      renderHook(() => useWakeLock(true));
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    });

    it("releases the lock when it goes inactive", async () => {
      const { rerender } = renderHook(({ active }) => useWakeLock(active), {
        initialProps: { active: true },
      });
      await vi.waitFor(() => expect(request).toHaveBeenCalled());

      rerender({ active: false });

      await vi.waitFor(() => expect(release).toHaveBeenCalled());
    });

    it("releases the lock on unmount", async () => {
      const { unmount } = renderHook(() => useWakeLock(true));
      await vi.waitFor(() => expect(request).toHaveBeenCalled());

      unmount();

      expect(release).toHaveBeenCalled();
    });

    it("re-requests the lock when the tab becomes visible again", async () => {
      renderHook(() => useWakeLock(true));
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

      setVisibility("hidden");
      setVisibility("visible");

      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    });
  });

  describe("without Wake Lock API support (older iOS Safari)", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: undefined,
      });
      HTMLCanvasElement.prototype.captureStream = vi
        .fn()
        .mockReturnValue({} as MediaStream);
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    });

    it("falls back to a silent looping video to prevent the screen from sleeping", async () => {
      renderHook(() => useWakeLock(true));

      await vi.waitFor(() => {
        const video = document.querySelector("video");
        expect(video).not.toBeNull();
        expect(video?.loop).toBe(true);
        expect(video?.muted).toBe(true);
      });
    });

    it("removes the fallback video once inactive", async () => {
      const { rerender } = renderHook(({ active }) => useWakeLock(active), {
        initialProps: { active: true },
      });
      await vi.waitFor(() => expect(document.querySelector("video")).not.toBeNull());

      rerender({ active: false });

      expect(document.querySelector("video")).toBeNull();
    });

    afterEach(() => {
      // @ts-expect-error test shim
      delete HTMLCanvasElement.prototype.captureStream;
    });
  });
});
