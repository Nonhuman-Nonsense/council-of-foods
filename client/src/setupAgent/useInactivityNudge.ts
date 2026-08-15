import { useEffect, useRef } from "react";

type UseInactivityNudgeParams = {
  agentSpeaking: boolean;
  lastUserTranscript: string | null;
  sendMessage: (text: string) => void;
  requestResponse: () => void;
  message: string;
  delayMs: number;
  enabled: boolean;
  onNudgeFired?: () => void;
  /**
   * Opaque value that changes whenever the visitor does something the hook
   * can't otherwise observe — e.g. typing in a text field, which touches
   * neither `agentSpeaking` nor `lastUserTranscript`. Any change resets the
   * countdown, same as a transcript change. Compared by reference/value each
   * render, so a fresh object each time (like a click-event record) works.
   */
  lastActivity?: unknown;
};

/**
 * Fires a nudge after the agent finishes speaking and the visitor stays
 * silent for `delayMs` milliseconds.
 *
 * Timer starts when `agentSpeaking` is false (audio ended).
 * Timer clears when `agentSpeaking` is true (agent speaking again).
 * Timer resets when `lastUserTranscript` changes (visitor spoke) or
 * `lastActivity` changes (visitor did something else, e.g. typing).
 *
 * Does nothing until the agent has spoken at least once.
 */
export function useInactivityNudge({
  agentSpeaking,
  lastUserTranscript,
  sendMessage,
  requestResponse,
  message,
  delayMs,
  enabled,
  onNudgeFired,
  lastActivity,
}: UseInactivityNudgeParams): void {
  const agentHasSpokenRef = useRef(false);
  const sendMessageRef = useRef(sendMessage);
  const requestResponseRef = useRef(requestResponse);
  const messageRef = useRef(message);
  const onNudgeFiredRef = useRef(onNudgeFired);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    requestResponseRef.current = requestResponse;
    messageRef.current = message;
    onNudgeFiredRef.current = onNudgeFired;
  });

  // Track whether the agent has ever spoken.
  useEffect(() => {
    if (agentSpeaking) agentHasSpokenRef.current = true;
  }, [agentSpeaking]);

  // Reset guard when disabled (e.g. muted or reconnecting).
  useEffect(() => {
    if (!enabled) agentHasSpokenRef.current = false;
  }, [enabled]);

  // Core timer: starts when agent stops speaking, resets on any user speech.
  // Re-runs (and resets the countdown) whenever agentSpeaking or
  // lastUserTranscript changes.
  useEffect(() => {
    if (!enabled || !agentHasSpokenRef.current || agentSpeaking) return;

    const id = setTimeout(() => {
      onNudgeFiredRef.current?.();
      sendMessageRef.current(messageRef.current);
      requestResponseRef.current();
    }, delayMs);
    return () => clearTimeout(id);

  }, [agentSpeaking, lastUserTranscript, enabled, delayMs, lastActivity]);
}
