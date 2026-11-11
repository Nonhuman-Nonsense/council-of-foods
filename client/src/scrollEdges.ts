import { type CSSProperties, type RefObject, useEffect, useState } from "react";

export type ScrollAxis = "x" | "y";

/** Whether there is more to scroll to before the start and past the end. */
export type ScrollEdges = { moreBefore: boolean; moreAfter: boolean };

/** Within this many px of an edge counts as at it: sub-pixel widths never quite reach. */
const EDGE_SLACK_PX = 1;

/** Reads where a scroll box stands along one axis. */
export function readScrollEdges(el: HTMLElement, axis: ScrollAxis): ScrollEdges {
  const position = axis === "x" ? el.scrollLeft : el.scrollTop;
  const visible = axis === "x" ? el.clientWidth : el.clientHeight;
  const total = axis === "x" ? el.scrollWidth : el.scrollHeight;
  return {
    moreBefore: position > EDGE_SLACK_PX,
    moreAfter: position + visible < total - EDGE_SLACK_PX,
  };
}

/**
 * Tracks whether a scroll box has more to show before and after what is visible,
 * following scrolling and the box or its content changing size. For edge fades
 * that only show where there is something to scroll to.
 *
 * `contentKey` re-reads when the content is swapped for other content of the same
 * size, which no resize reports (another description in the same box).
 */
export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
  axis: ScrollAxis,
  contentKey?: unknown,
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ moreBefore: false, moreAfter: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = readScrollEdges(el, axis);
      setEdges((prev) =>
        prev.moreBefore === next.moreBefore && prev.moreAfter === next.moreAfter ? prev : next,
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
      for (const child of Array.from(el.children)) observer.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref, axis, contentKey]);

  return edges;
}

/**
 * Fades out whichever edges of a scroll box have more beyond them, as a mask on
 * the box itself, so the fade stays put while the content scrolls under it.
 */
export function scrollFadeStyle(axis: ScrollAxis, edges: ScrollEdges, fadePx: number): CSSProperties {
  if (!edges.moreBefore && !edges.moreAfter) return {};
  const direction = axis === "x" ? "to right" : "to bottom";
  const start = edges.moreBefore ? `transparent 0, black ${fadePx}px` : "black 0";
  const end = edges.moreAfter ? `black calc(100% - ${fadePx}px), transparent 100%` : "black 100%";
  const mask = `linear-gradient(${direction}, ${start}, ${end})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
