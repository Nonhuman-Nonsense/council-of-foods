import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import { usePagePresence } from "@/utils";
import { useInactivityNudge } from "./useInactivityNudge";
import type { SetupAgentState } from "./useSetupAgent";

const HIDDEN_GRACE_MS = 60_000;
const IDLE_TIMEOUT_MS = 3 * 60_000;
const NUDGE_DELAY_MS = 10_000;

export type UseAgentPresenceParams = {
  agent: SetupAgentState;
  phase: MeetingSetupPhase;
  /**
   * Opaque value that changes on visitor activity the hook can't otherwise
   * observe — e.g. typing a panelist's details, which touches neither
   * `agentSpeaking` nor `lastUserTranscript`. Resets both the nudge countdown
   * and the absolute idle timeout, so the agent doesn't ask "are you there?"
   * — or tear the session down — while the visitor is mid-sentence.
   */
  lastActivity?: unknown;
};

export type AgentPresenceState = {
  /** True while a nudge or return-from-away message is in flight — suppresses banner correlation. */
  nudgeFired: boolean;
  /** Signal engagement the hook can't observe itself (e.g. a PTT button press) — clears the nudge flag. */
  clearNudge: () => void;
};

/**
 * Keeps the setup agent's realtime session honest about whether a visitor is
 * actually present: nudges on silence, tears down on tab-hidden/idle, and
 * resumes on return.
 */
export function useAgentPresence({ agent, phase, lastActivity }: UseAgentPresenceParams): AgentPresenceState {
  const { sendUserMessage, muted } = agent;
  // Visible *and* focused — switching tabs and switching to another program
  // are both "not present", and neither alone would catch both (see
  // `usePagePresence`). Nudging into a tab nobody is looking at, or one the
  // visitor has left for another program, is equally pointless.
  const isPresent = usePagePresence();
  const [nudgeFired, setNudgeFired] = useState(false);

  useInactivityNudge({
    agentSpeaking: agent.agentSpeaking,
    lastUserTranscript: agent.lastUserTranscript,
    sendMessage: sendUserMessage,
    requestResponse: agent.requestAgentResponse,
    delayMs: NUDGE_DELAY_MS,
    enabled: !agent.isConnecting && !muted && isPresent,
    onNudgeFired: () => setNudgeFired(true),
    lastActivity,
    // A visitor who has never had a microphone isn't "quiet" — they're reading.
    // Asking them to respond would be asking for something they can't give.
    // Once they have spoken, push-to-talk shuts the mic between utterances, so
    // a closed mic is no reason to stop talking with them.
    message: !agent.hasEverHeardVisitor
      ? "The visitor has been still for a while. Say something brief about what is on screen, or offer a thought that might help them choose. Do not ask them anything."
      : phase === "landing"
        ? "The visitor is quiet. Gently prompt them to respond to you."
        : "The visitor has been quiet for a while. Check in with them — ask if they need help or have a question.",
  });

  // Shared flag: set whenever we tear down the session because the visitor
  // is away — not present for 60s, or present but silent for 3 minutes.
  // Cleared on resume. Read by the presence effect below regardless of which
  // timer set it, so there is exactly one resume path — not one per teardown
  // reason, which would race the same flag against itself on a single
  // "welcome back" moment.
  const stoppedByBackgroundRef = useRef(false);

  // Not present: start a grace timer; if still away after 60s, tear down the
  // session. Present again after teardown: auto-resume (greeting plays on its
  // own). Present again within the grace period: send an immediate refocus
  // message. This is the only place either kind of teardown gets resumed —
  // the absolute idle timer below only ever *starts* the away clock; it does
  // not need its own resume path, since coming back always changes presence
  // eventually (an idle-but-present visitor who returns to interacting resumes
  // through the normal start-the-agent paths instead, e.g. pressing the mic).
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }

    if (!isPresent) {
      const id = setTimeout(() => {
        stoppedByBackgroundRef.current = true;
        agent.stop();
      }, HIDDEN_GRACE_MS);
      return () => clearTimeout(id);
    }

    if (stoppedByBackgroundRef.current) {
      stoppedByBackgroundRef.current = false;
      void agent.start();
    } else if (!muted && !agent.isConnecting && !agent.agentSpeaking) {
      sendUserMessage(
        !agent.hasEverHeardVisitor
          ? "The visitor has returned after a brief absence. Welcome them back in one short sentence. Do not ask them anything."
          : phase === "landing"
            ? "The visitor has returned after a brief absence. Welcome them back and invite them to continue."
            : "The visitor has returned after a brief absence. Check in warmly and help them pick up where they left off.",
      );
      agent.requestAgentResponse();
      setNudgeFired(true);
    }

  }, [isPresent]);

  // Absolute idle timer: if no user speech for 3 minutes, tear down the
  // session even though the visitor never left — present the whole time,
  // just silent. The presence effect above still handles resuming: presence
  // toggling at all (a blur/refocus, a tab switch) picks it up, and a direct
  // interaction (e.g. the mic button) resumes through its own path regardless.
  useEffect(() => {
    if (muted) return;
    const id = setTimeout(() => {
      stoppedByBackgroundRef.current = true;
      agent.stop();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(id);

  }, [agent.lastUserTranscript, muted, lastActivity]);

  // Real user input clears the nudge override.
  useEffect(() => {
    if (!agent.lastUserTranscript) return;
    setNudgeFired(false);
  }, [agent.lastUserTranscript]);

  const clearNudge = useCallback(() => setNudgeFired(false), []);

  return { nudgeFired, clearNudge };
}
