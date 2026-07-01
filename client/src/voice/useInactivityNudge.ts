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
};

/**
 * Fires a nudge after the agent finishes speaking and the visitor stays
 * silent for `delayMs` milliseconds.
 *
 * Timer starts when `agentSpeaking` is false (audio ended).
 * Timer clears when `agentSpeaking` is true (agent speaking again).
 * Timer resets when `lastUserTranscript` changes (visitor spoke).
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSpeaking, lastUserTranscript, enabled, delayMs]);
}
