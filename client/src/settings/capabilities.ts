import type { AppMode } from "./councilSettings";

/**
 * What the app does, decoupled from which install it is.
 *
 * Derived from {@link AppMode}, never stored: persisted per-capability flags
 * drift out of step with the mode (flip to museum, flip back, keep whatever the
 * last write left), so every install becomes a snowflake and "what does web
 * mode do?" stops having an answer you can read off the code. The table below
 * is that answer.
 *
 * The two genuinely independent staff overrides — the hardware button and the
 * LED preview overlay — stay separate stored settings, because they cut across
 * both modes (a laptop can drive a real button for testing).
 */
export type Capabilities = {
  /**
   * Nobody is present to fix a failure, so the app must recover by itself and
   * must never come to rest on a dead end: retry forever, auto-reload, offer a
   * self-restart, and treat a missing microphone as fatal rather than as
   * something the visitor could go and permit.
   */
  unattended: boolean;
  /**
   * The visitor drives their own browser with a pointer and a keyboard, so the
   * page can offer navigation chrome, close buttons, and downloads. A kiosk has
   * none of that, and an affordance nobody can reach is worse than absent.
   */
  browserUi: boolean;
  /** Meeting-time agent that fields interruptions and the soft-cap question. */
  metaAgent: boolean;
  /** Summary renders as a scrolling teleprompter rather than a readable page. */
  teleprompter: boolean;
  /** Releasing push-to-talk sends the transcript instead of leaving it to edit. */
  autoSubmitHumanInput: boolean;
  /** Unattended playback coordinator. */
  autoplay: boolean;
  /** Hide the pointer after an idle window. */
  cursorHide: boolean;
  /** Acquire the microphone at connect, rather than on demand from a gesture. */
  micUpFront: boolean;
  /** Bottom-centre mic control — needs a pointer, and something to point at. */
  micToggleButton: boolean;
  /**
   * A tap latches the microphone on; a hold stays momentary. Hold works in both
   * modes; only latching is gated. On an unattended kiosk a latched-open mic has
   * no keyboard to clear it and no on-screen button to reveal it, so the
   * visitor's only exit is a gesture nobody taught them.
   */
  latchOnTap: boolean;
};

const WEB: Capabilities = {
  unattended: false,
  browserUi: true,
  metaAgent: false,
  teleprompter: false,
  autoSubmitHumanInput: false,
  autoplay: false,
  cursorHide: false,
  micUpFront: false,
  micToggleButton: true,
  latchOnTap: true,
};

const MUSEUM: Capabilities = {
  unattended: true,
  browserUi: false,
  metaAgent: true,
  teleprompter: true,
  autoSubmitHumanInput: true,
  autoplay: true,
  cursorHide: true,
  micUpFront: true,
  micToggleButton: false,
  latchOnTap: false,
};

export function capabilitiesFor(mode: AppMode): Capabilities {
  return mode === "museum" ? MUSEUM : WEB;
}
