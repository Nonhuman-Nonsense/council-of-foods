/**
 * Has anyone actually been at this page?
 *
 * Crawlers and link previewers run our JavaScript but never move a pointer,
 * scroll or press a key. Any of those counts as a sign of life — looser than
 * the click/tap/key gesture browsers require to unlock audio.
 */

import { useSyncExternalStore } from "react";

const EVENTS = ["pointermove", "pointerdown", "touchstart", "scroll", "keydown"] as const;

let seen = false;
const listeners = new Set<() => void>();

function onSign(): void {
  seen = true;
  for (const name of EVENTS) window.removeEventListener(name, onSign, true);
  for (const listener of listeners) listener();
}

/** Call once at app startup. */
export function installSignOfLife(): void {
  if (typeof window === "undefined" || seen) return;
  for (const name of EVENTS) window.addEventListener(name, onSign, { capture: true, passive: true });
}

export function hasSignOfLife(): boolean {
  return seen;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders once, when the first sign of life arrives. */
export function useSignOfLife(): boolean {
  return useSyncExternalStore(subscribe, hasSignOfLife);
}

/** Test seam: forget any sign of life and detach listeners. */
export function resetSignOfLifeForTests(): void {
  for (const name of EVENTS) window.removeEventListener(name, onSign, true);
  seen = false;
}
