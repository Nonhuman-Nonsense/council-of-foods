import { useEffect, useRef } from "react";

type UseInactivityNudgeParams = {
  lastCaption: string | null;
  lastUserTranscript: string | null;
  sendMessage: (text: string) => void;
  requestResponse: () => void;
  message: string;
  delayMs: number;
  enabled: boolean;
};

/**
 * Fires a nudge + requests an agent response when there has been no caption
 * or user transcript activity for `delayMs` milliseconds.
 *
 * Uses a debounce approach: any change to `lastCaption` or `lastUserTranscript`
 * resets the timer. This avoids relying on `lastCaption` going null (which can
 * get stuck on the last subtitle text after audio finishes).
 *
 * Does nothing until the agent has spoken at least once (guards against
 * nudging before the greeting fires).
 */
export function useInactivityNudge({
  lastCaption,
  lastUserTranscript,
  sendMessage,
  requestResponse,
  message,
  delayMs,
  enabled,
}: UseInactivityNudgeParams): void {
  const agentHasSpokenRef = useRef(false);
  const sendMessageRef = useRef(sendMessage);
  const requestResponseRef = useRef(requestResponse);
  const messageRef = useRef(message);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    requestResponseRef.current = requestResponse;
    messageRef.current = message;
  });

  // Track whether the agent has ever spoken.
  useEffect(() => {
    if (lastCaption !== null) agentHasSpokenRef.current = true;
  }, [lastCaption]);

  // Reset agentHasSpoken when disabled (e.g. muted or reconnecting).
  useEffect(() => {
    if (!enabled) agentHasSpokenRef.current = false;
  }, [enabled]);

  // Debounce: reset timer on any caption or transcript activity.
  // Fires only after the agent has spoken at least once.
  useEffect(() => {
    if (!enabled || !agentHasSpokenRef.current) return;
    const id = setTimeout(() => {
      sendMessageRef.current(messageRef.current);
      requestResponseRef.current();
    }, delayMs);
    return () => clearTimeout(id);
  }, [lastCaption, lastUserTranscript, enabled, delayMs]);
}
