/**
 * Module-level button ownership stack.
 *
 * Components that drive the installation button call claimButton(id) on mount
 * and the returned release() on unmount.
 */

type OwnerChangeListener = (owner: string | null) => void;

let stack: string[] = [];
let listeners: OwnerChangeListener[] = [];

function notify(): void {
  const owner = stack.length > 0 ? stack[stack.length - 1] : null;
  for (const fn of listeners) {
    fn(owner);
  }
}

export function claimButton(id: string): () => void {
  stack = [...stack.filter((o) => o !== id), id];
  notify();
  return () => {
    stack = stack.filter((o) => o !== id);
    notify();
  };
}

export function getCurrentButtonOwner(): string | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

export function onButtonOwnerChange(fn: OwnerChangeListener): () => void {
  listeners = [...listeners, fn];
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** Reset all state — for use in tests only. */
export function _resetButtonOwnership(): void {
  stack = [];
  listeners = [];
}
