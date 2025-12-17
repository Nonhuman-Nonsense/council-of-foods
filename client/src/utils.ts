import { useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive'

// Global Constants
export const dvh = CSS.supports('height', '100dvh') ? 'dvh' : 'vh';

export const minWindowHeight = 300;

/* -------------------------------------------------------------------------- */
/*                              String Helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Capitalizes the first letter of a string.
 * @param {string} string - The input string.
 * @returns {string} The capitalized string.
 */
export function capitalizeFirstLetter(string) {
  if (string && typeof string === "string") {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  return string || "";
}

/**
 * Converts a string to Title Case.
 * @param {string} string - The input string.
 * @returns {string} The title-cased string.
 */
export function toTitleCase(string) {
  if (!string || typeof string !== 'string') return "";
  return string
    .toLowerCase()
    .split(' ')
    .map(capitalizeFirstLetter)
    .join(' ');
}

/**
 * Converts a string to a filename-safe format (lowercase, underscores).
 * @param {string} string - The input string (e.g. "Potato Chip").
 * @returns {string} The filename string (e.g. "potato_chip").
 */
export function filename(string) {
  return string ? string.toLowerCase().replaceAll(" ", "_") : "";
}

/* -------------------------------------------------------------------------- */
/*                              Responsive Hooks                              */
/* -------------------------------------------------------------------------- */

// Same breakpoint everywhere
/**
 * Hook to check if the device is considered "mobile" (max-height: 600px).
 * @returns {boolean} True if mobile.
 */
export function useMobile() {
  return useMediaQuery({ query: '(max-height: 600px)' });
}

/**
 * Hook to check if the device is "extra small mobile" (max-height: 370px).
 * @returns {boolean} True if xs mobile.
 */
export function useMobileXs() {
  return useMediaQuery({ query: '(max-height: 370px)' });
}

/**
 * Hook to check if the device is in portrait mode and narrow.
 * @returns {boolean} True if portrait mobile.
 */
export function usePortrait() {
  return useMediaQuery({ query: "(orientation: portrait) and (max-width: 600px)" });
}

/* -------------------------------------------------------------------------- */
/*                              Browser Hooks                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hook to track document visibility state.
 * @returns {boolean} True if the document is visible.
 */
export function useDocumentVisibility() {
  const [isDocumentVisible, setIsDocumentVisible] = useState(!document.hidden);

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

/* -------------------------------------------------------------------------- */
/*                               Math Helpers                                 */
/* -------------------------------------------------------------------------- */

// Put chair in the middle always
/**
 * Maps a flat index to a centered distribution for visual arrangement.
 * @param {number} total - Total number of items.
 * @param {number} index - Current item index.
 * @returns {number} The visual index.
 */
export function mapFoodIndex(total, index) {
  return (Math.ceil(total / 2) + index - 1) % total;
}