import { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive'

/**
 * Global Constants
 */
export const dvh: string = CSS.supports('height', '100dvh') ? 'dvh' : 'vh';

/* -------------------------------------------------------------------------- */
/*                              String Helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Capitalizes the first letter of a string.
 */
export function capitalizeFirstLetter(string: string): string {
  if (string && typeof string === "string") {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  return string || "";
}

/**
 * Converts a string to Title Case.
 */
export function toTitleCase(string: string): string {
  if (!string || typeof string !== 'string') return "";
  return string
    .toLowerCase()
    .split(' ')
    .map(capitalizeFirstLetter)
    .join(' ');
}

/**
 * Converts a string to a filename-safe format (lowercase, underscores).
 */
export function filename(string: string): string {
  return string ? string.toLowerCase().replaceAll(" ", "_") : "";
}

/* -------------------------------------------------------------------------- */
/*                              Responsive Hooks                              */
/* -------------------------------------------------------------------------- */

// Same breakpoint everywhere
/**
 * Hook to check if the device is considered "mobile" (max-height: 600px).
 */
export function useMobile(): boolean {
  return useMediaQuery({ query: '(max-height: 600px)' });
}

/**
 * Hook to check if the device is "extra small mobile" (max-height: 370px).
 */
export function useMobileXs(): boolean {
  return useMediaQuery({ query: '(max-height: 370px)' });
}

/**
 * Hook to check if the device is in portrait mode and narrow.
 */
export function usePortrait(): boolean {
  return useMediaQuery({ query: "(orientation: portrait) and (max-width: 600px)" });
}

/* -------------------------------------------------------------------------- */
/*                              Browser Hooks                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hook to track document visibility state.
 */
export function useDocumentVisibility(): boolean {
  const [isDocumentVisible, setIsDocumentVisible] = useState<boolean>(!document.hidden);

  const handleVisibilityChange = () => {
    setIsDocumentVisible(!document.hidden);
  };

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isDocumentVisible;
}

/**
 * Whether the visitor could plausibly be looking at this page right now:
 * the tab is visible *and* the window has focus.
 *
 * Wider than {@link useDocumentVisibility} on purpose, and the two do not
 * overlap: switching to another program leaves the tab "visible" (the Page
 * Visibility spec only tracks whether the tab is being rendered, not whether
 * the window has input focus) but blurs the window — visibilitychange alone
 * misses it. Switching tabs within the same window is the reverse: the
 * window stays OS-focused throughout, only visibilitychange fires. Neither
 * event alone is enough; this listens for both.
 */
export function usePagePresence(): boolean {
  const computePresent = () => !document.hidden && document.hasFocus();
  const [present, setPresent] = useState<boolean>(computePresent);

  useEffect(() => {
    const update = () => setPresent(computePresent());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('blur', update);
    window.addEventListener('focus', update);

    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('blur', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return present;
}

/* -------------------------------------------------------------------------- */
/*                               Math Helpers                                 */
/* -------------------------------------------------------------------------- */

// Put chair in the middle always
/**
 * Maps a flat index to a centered distribution for visual arrangement.
 */
export function mapFoodIndex(total: number, index: number): number {
  return (Math.ceil(total / 2) + index - 1) % total;
}