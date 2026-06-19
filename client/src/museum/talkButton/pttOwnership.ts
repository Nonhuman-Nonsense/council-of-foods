/**
 * Module-level PTT ownership stack.
 *
 * Each component that wants to drive the talk button calls claimPtt(id)
 * on mount and the returned release() on unmount.  The most-recently-registered
 * owner sits on top of the stack and is the only one that should activate its
 * LED and react to pressed events.
 *
 * Stack semantics mean HumanInput (mounted inside the council route) always
 * wins over a future meta-agent (mounted at the shell level), without any
 * prop-drilling or event bus.
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

/**
 * Register as the current PTT owner.
 * @returns A cleanup function that releases ownership.
 */
export function claimPtt(id: string): () => void {
  // Remove any existing claim from this id (idempotent re-claim)
  stack = [...stack.filter(o => o !== id), id];
  notify();
  return () => {
    stack = stack.filter(o => o !== id);
    notify();
  };
}

/** The id of the component currently on top of the ownership stack, or null. */
export function getCurrentPttOwner(): string | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * Subscribe to ownership changes.
 * @returns Unsubscribe function.
 */
export function onPttOwnerChange(fn: OwnerChangeListener): () => void {
  listeners = [...listeners, fn];
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

/** Reset all state — for use in tests only. */
export function _resetPttOwnership(): void {
  stack = [];
  listeners = [];
}
