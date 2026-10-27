import { Component, type ReactNode } from "react";
import { reloadWhenHealthy } from "./reload";

/** How long a crashed meter stays black before it reloads. */
export const CRASH_RELOAD_MS = 30_000;

/**
 * A render error would otherwise leave the screen black until someone restarts it. Shows black
 * for a moment, then reloads; an error that comes back on every load is retried at that pace.
 */
export class MeterErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error): void {
    console.error("Meter crashed, reloading", error);
    setTimeout(() => void reloadWhenHealthy(), CRASH_RELOAD_MS);
  }

  render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}
