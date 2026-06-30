import { useEffect, useRef, type RefObject } from "react";
import type { PlaybackStartInfo } from "@council/output/AudioOutputMessage";

/** Playback snapshot for museum summary teleprompter scroll. */
export type SummaryPlaybackState = {
  playbackStartInfo: PlaybackStartInfo;
  duration: number;
  isPaused: boolean;
} | null;

/** Bottom runway as a fraction of the scroll viewport height. */
export const TELEPROMPTER_PADDING_RATIO = 0.35;

/** Overlay top inset (OverlayWrapper 60px + Summary marginTop 20px on desktop). */
export const TELEPROMPTER_TOP_PADDING_DESKTOP = 80;
export const TELEPROMPTER_TOP_PADDING_MOBILE = 10;

export function computeTeleprompterTopPadding(isMobile: boolean): number {
  return isMobile ? TELEPROMPTER_TOP_PADDING_MOBILE : TELEPROMPTER_TOP_PADDING_DESKTOP;
}

export function computeTeleprompterBottomPadding(viewportHeight: number): number {
  if (viewportHeight <= 0) {
    return 0;
  }
  return Math.round(viewportHeight * TELEPROMPTER_PADDING_RATIO);
}

export function computeTeleprompterScrollTop(params: {
  scrollHeight: number;
  clientHeight: number;
  elapsedSeconds: number;
  duration: number;
}): number {
  const maxScroll = params.scrollHeight - params.clientHeight;
  if (maxScroll <= 0 || params.duration <= 0) {
    return 0;
  }
  const progress = Math.min(1, Math.max(0, params.elapsedSeconds / params.duration));
  return progress * maxScroll;
}

export type UseAudioSyncedScrollParams = {
  scrollRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  playback: SummaryPlaybackState;
  audioContext: RefObject<AudioContext | null>;
};

/**
 * Linear teleprompter scroll synced to the Web Audio clock.
 * Expects top/bottom padding on the scroll content so the protocol can scroll off the viewport edges.
 */
export function useAudioSyncedScroll({
  scrollRef,
  enabled,
  playback,
  audioContext,
}: UseAudioSyncedScrollParams): void {
  const pausedScrollTopRef = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!enabled || !element) {
      return;
    }

    if (!playback?.playbackStartInfo || playback.duration <= 0) {
      element.scrollTop = 0;
      return;
    }

    const { playbackStartInfo, duration, isPaused } = playback;
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isPaused) {
      pausedScrollTopRef.current = element.scrollTop;
      return;
    }

    let requestId: number | null = null;

    const applyScroll = (elapsedSeconds: number, jumpOnly: boolean): void => {
      const el = scrollRef.current;
      const context = audioContext.current;
      if (!el || !context) {
        return;
      }

      const scrollTop = computeTeleprompterScrollTop({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        elapsedSeconds,
        duration,
      });
      el.scrollTop = scrollTop;

      if (!jumpOnly) {
        requestId = requestAnimationFrame(animate);
      }
    };

    const animate = (): void => {
      const context = audioContext.current;
      if (!context || !scrollRef.current) {
        return;
      }

      const elapsed = Math.max(
        0,
        context.currentTime - playbackStartInfo.startedAtAudioContextTime,
      );
      applyScroll(elapsed, false);
    };

    if (reduceMotion) {
      const context = audioContext.current;
      if (context) {
        const elapsed = Math.max(
          0,
          context.currentTime - playbackStartInfo.startedAtAudioContextTime,
        );
        applyScroll(elapsed, true);
      }
      return;
    }

    requestId = requestAnimationFrame(animate);

    return () => {
      if (requestId !== null) {
        cancelAnimationFrame(requestId);
      }
    };
  }, [
    scrollRef,
    enabled,
    playback?.playbackStartInfo?.messageId,
    playback?.playbackStartInfo?.startedAtAudioContextTime,
    playback?.duration,
    playback?.isPaused,
    audioContext,
  ]);
}
