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
 * every mode (a laptop can drive a real button for testing).
 *
 * Nothing outside this file may branch on the mode itself. A capability names a
 * behaviour, so a new mode has to answer for it; a `mode === "museum"` test
 * silently drops every other mode into the web branch.
 */
export type Capabilities = {
  /**
   * Nobody is present to fix a failure, so the app recovers by itself: retry
   * forever, block on reconnect, treat a missing microphone as fatal rather
   * than as something the visitor could go and permit, and resume a meeting
   * paused by an environmental interrupt (tab switch, restored connection).
   *
   * Presenter keeps this despite having a person present: installation chrome
   * has no play/pause control, so a meeting paused by a tab switch would have
   * no way back.
   */
  selfHealing: boolean;
  /**
   * Restart the app on its own — reload after a prolonged disconnect, and count
   * down to a restart on the error screen. Unattended installs must never come
   * to rest on a dead end; a screening must never have the screen wiped
   * mid-sentence, so it gets a plain restart button instead.
   */
  autoRestart: boolean;
  /**
   * When the app is waiting on the visitor and the visitor says nothing, answer
   * on their behalf: skip their turn, resume after an interruption, conclude at
   * the soft cap. A museum visitor walks away mid-prompt and the meeting has to
   * go on regardless; a presenter's silence is them talking to the room, and
   * every one of those answers would cut them off.
   */
  idleAnswersForVisitor: boolean;
  /**
   * The setup agent checks in on a quiet visitor and eventually tears the
   * session down. During a screening the quiet is the presenter talking, and an
   * agent interrupting them is the worst thing on this list.
   */
  idleNudge: boolean;
  /** Leave the summary for the landing page once the reading has finished. */
  autoReturnToLanding: boolean;
  /**
   * The visitor drives their own browser with a pointer and a keyboard, so the
   * page can offer navigation chrome, close buttons, and downloads. An
   * installation has none of that, and an affordance nobody can reach is worse
   * than absent.
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
   * A tap latches the microphone on; a hold stays momentary. Hold works in
   * every mode; only latching is gated. On an unattended installation a latched-open
   * mic has no keyboard to clear it and no on-screen button to reveal it, so
   * the visitor's only exit is a gesture nobody taught them — and at a
   * screening it would keep hearing the presenter narrate.
   */
  latchOnTap: boolean;
  /**
   * Setup runs as a voice conversation with the agent presented installation-style:
   * mic row, council-width subtitles, button banner, and a prompt that explains
   * the talk button.
   */
  voiceSetupAgent: boolean;
  /**
   * Human panelists are added and described by hand. Where they cannot be,
   * panelists go in by name alone, the visitor is added as one automatically,
   * and the lineup is ordered for the screen instead.
   *
   * Only the panelists: moving between setup steps is {@link browserUi}, which
   * a screening does not have — the agent still narrates the way through.
   *
   * Independent of {@link voiceSetupAgent}: a screening has both a presenter
   * with a keyboard and an agent doing the talking.
   */
  typedSetup: boolean;
  /**
   * A fixed installation reloads to the app root in the default language, after
   * a health probe — the next visitor should not inherit the last one's
   * language, or a reload into a server that is still coming back up.
   */
  installationReload: boolean;
};

const WEB: Capabilities = {
  selfHealing: false,
  autoRestart: false,
  idleAnswersForVisitor: false,
  idleNudge: true,
  autoReturnToLanding: false,
  browserUi: true,
  metaAgent: false,
  teleprompter: false,
  autoSubmitHumanInput: false,
  autoplay: false,
  cursorHide: false,
  micUpFront: false,
  micToggleButton: true,
  latchOnTap: true,
  voiceSetupAgent: false,
  typedSetup: true,
  installationReload: false,
};

const MUSEUM: Capabilities = {
  selfHealing: true,
  autoRestart: true,
  idleAnswersForVisitor: true,
  idleNudge: true,
  autoReturnToLanding: true,
  browserUi: false,
  metaAgent: true,
  teleprompter: true,
  autoSubmitHumanInput: true,
  autoplay: true,
  cursorHide: true,
  micUpFront: true,
  micToggleButton: false,
  latchOnTap: false,
  voiceSetupAgent: true,
  typedSetup: false,
  installationReload: true,
};

/**
 * Performative screening: museum without anything that drives the app forward
 * on its own, because the person standing next to it is talking and the screen
 * must wait for them. Chrome, teleprompter, meta agent, push-to-talk and
 * self-healing are the museum's.
 *
 * Adding human panelists is the exception: a presenter has a keyboard, and
 * putting people on the council by hand is part of showing the piece off. The
 * agent still walks the setup from step to step.
 */
const PRESENTER: Capabilities = {
  ...MUSEUM,
  autoRestart: false,
  idleAnswersForVisitor: false,
  idleNudge: false,
  autoReturnToLanding: false,
  autoplay: false,
  typedSetup: true,
};

const CAPABILITIES: Record<AppMode, Capabilities> = {
  web: WEB,
  museum: MUSEUM,
  presenter: PRESENTER,
};

export function capabilitiesFor(mode: AppMode): Capabilities {
  return CAPABILITIES[mode];
}
