import { useEffect, useRef } from "react";

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
};

/**
 * Fallback for browsers without the Wake Lock API (notably iOS Safari < 16.4):
 * a muted, invisible looping video keeps the OS from treating the tab as idle.
 * Uses canvas.captureStream so no video asset is needed.
 */
function createFallbackVideo(): HTMLVideoElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx?.fillRect(0, 0, 1, 1);

  const captureStream = (
    canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
  ).captureStream;
  if (!captureStream) return null;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.srcObject = captureStream.call(canvas, 1);
  return video;
}

/**
 * Keeps the screen awake while `active` is true (e.g. a meeting is playing).
 * Screen Wake Lock is released by the browser whenever the tab is hidden, so
 * it's re-requested on `visibilitychange`; iOS Safari below 16.4 has no Wake
 * Lock API at all, so it falls back to a silent looping video, the same
 * trick used by NoSleep.js.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const nav = navigator as NavigatorWithWakeLock;
    let cancelled = false;

    async function acquire() {
      if (nav.wakeLock) {
        try {
          const sentinel = await nav.wakeLock!.request("screen");
          if (cancelled) {
            void sentinel.release();
            return;
          }
          sentinelRef.current = sentinel;
        } catch {
          // Request can fail (e.g. tab not visible yet); visibilitychange retries it.
        }
        return;
      }

      if (!fallbackVideoRef.current) {
        fallbackVideoRef.current = createFallbackVideo();
        if (fallbackVideoRef.current) document.body.appendChild(fallbackVideoRef.current);
      }
      void fallbackVideoRef.current?.play().catch(() => {});
    }

    void acquire();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void acquire();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinelRef.current) {
        void sentinelRef.current.release();
        sentinelRef.current = null;
      }
      if (fallbackVideoRef.current) {
        fallbackVideoRef.current.pause();
        fallbackVideoRef.current.remove();
        fallbackVideoRef.current = null;
      }
    };
  }, [active]);
}
