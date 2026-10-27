import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Reachable by Tab: not inside a closed <details>, other than that details' own summary. */
function tabbable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const closed = el.closest("details:not([open])");
    return !closed || (el.tagName === "SUMMARY" && el.parentElement === closed);
  });
}

/**
 * Keeps keyboard focus inside an overlay while it is open: focus moves into it on mount, Tab
 * and Shift+Tab wrap around at its ends instead of walking into the page hidden behind it, and
 * focus goes back to where it was on unmount. The container needs `tabIndex={-1}`.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    container.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      const items = tabbable(container);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [ref]);
}
