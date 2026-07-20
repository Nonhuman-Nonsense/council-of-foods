import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingSetupPhase } from "@newMeeting/meetingSetup";
import { useDocumentVisibility } from "@/utils";
import { useInactivityNudge } from "./useInactivityNudge";
import type { SetupAgentState } from "./useSetupAgent";

const HIDDEN_GRACE_MS = 60_000;
const IDLE_TIMEOUT_MS = 3 * 60_000;
const NUDGE_DELAY_MS = 10_000;

export type UseAgentPresenceParams = {
  agent: SetupAgentState;
  phase: MeetingSetupPhase;
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
export function useAgentPresence({ agent, phase }: UseAgentPresenceParams): AgentPresenceState {
  const { sendUserMessage, muted } = agent;
  const isDocumentVisible = useDocumentVisibility();
  const [nudgeFired, setNudgeFired] = useState(false);

  // Stop nudging while the tab is hidden.
  useInactivityNudge({
    agentSpeaking: agent.agentSpeaking,
    lastUserTranscript: agent.lastUserTranscript,
    sendMessage: sendUserMessage,
    requestResponse: agent.requestAgentResponse,
    delayMs: NUDGE_DELAY_MS,
    enabled: !agent.isConnecting && !muted && isDocumentVisible,
    onNudgeFired: () => setNudgeFired(true),
    message:
      phase === "landing"
        ? "The visitor is quiet. Gently prompt them to respond to you."
        : "The visitor has been quiet for a while. Check in with them — ask if they need help or have a question.",
  });

  // Shared flag: set whenever we tear down the session due to the user being away
  // (tab hidden for 60s, or no speech for 3 min). Cleared on resume.
  const stoppedByBackgroundRef = useRef(false);

  // Handle tab visibility changes:
  // - Hidden: start a grace timer; if still hidden after 60s, tear down the session.
  // - Visible again after teardown: auto-resume (opening greeting plays automatically).
  // - Visible again within grace period: send an immediate refocus message.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }

    if (!isDocumentVisible) {
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
        phase === "landing"
          ? "The visitor has returned after a brief absence. Welcome them back and invite them to continue."
          : "The visitor has returned after a brief absence. Check in warmly and help them pick up where they left off.",
      );
      agent.requestAgentResponse();
      setNudgeFired(true);
    }

  }, [isDocumentVisible]);

  // Absolute idle timer: if no user speech for 3 minutes, tear down the session.
  // Covers the case where the tab stays visible but the user has switched to another app.
  useEffect(() => {
    if (muted) return;
    const id = setTimeout(() => {
      stoppedByBackgroundRef.current = true;
      agent.stop();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(id);

  }, [agent.lastUserTranscript, muted]);

  // Resume on window focus if the session was torn down by the background timer.
  // This handles returning from another app without switching tabs.
  useEffect(() => {
    function onWindowFocus() {
      if (!stoppedByBackgroundRef.current) return;
      stoppedByBackgroundRef.current = false;
      void agent.start();
    }
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);

  }, []);

  // Real user input clears the nudge override.
  useEffect(() => {
    if (!agent.lastUserTranscript) return;
    setNudgeFired(false);
  }, [agent.lastUserTranscript]);

  const clearNudge = useCallback(() => setNudgeFired(false), []);

  return { nudgeFired, clearNudge };
}
