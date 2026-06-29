import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMode } from "@/settings/councilSettings";

/** How long to wait after activity before nudging again with the hint. */
export const BUTTON_IDLE_REMIND_MS = 10_000;

export function computeShowHoldToSpeakHint(params: {
  agentMode: AgentMode;
  sessionActive: boolean;
  isConnecting: boolean;
  micOpen: boolean;
  dismissedAfterFirstPtt: boolean;
  idleRemindVisible: boolean;
}): boolean {
  if (params.agentMode !== "ptt" || !params.sessionActive || params.isConnecting || params.micOpen) {
    return false;
  }
  return !params.dismissedAfterFirstPtt || params.idleRemindVisible;
}

export function shouldShowIdleRemind(
  dismissedAfterFirstPtt: boolean,
  lastActivityMs: number,
  nowMs: number,
  idleRemindMs = BUTTON_IDLE_REMIND_MS,
): boolean {
  if (!dismissedAfterFirstPtt) {
    return false;
  }
  return nowMs - lastActivityMs >= idleRemindMs;
}

export type UseHoldToSpeakHintParams = {
  agentMode: AgentMode;
  sessionActive: boolean;
  isConnecting: boolean;
  micOpen: boolean;
  lastUserTranscript: string | null;
  lastCaption: string | null;
};

export type HoldToSpeakHintState = {
  showHoldToSpeakHint: boolean;
  /** True after the post-PTT idle window — the re-nudge, not the initial hint. */
  idleRemindVisible: boolean;
  /** Reset the idle clock and hide the pre-PTT banner (caller invokes on segment start). */
  bumpActivity: () => void;
};

/**
 * PTT hint visibility: show while the button is up until the first press,
 * then hide until a long idle period (no PTT, captions, or transcripts).
 */
export function useHoldToSpeakHint(params: UseHoldToSpeakHintParams): HoldToSpeakHintState {
  const {
    agentMode,
    sessionActive,
    isConnecting,
    micOpen,
    lastUserTranscript,
    lastCaption,
  } = params;

  const [dismissedAfterFirstPtt, setDismissedAfterFirstPtt] = useState(false);
  const [idleRemindVisible, setIdleRemindVisible] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const hasUsedPttRef = useRef(false);

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemindVisible(false);
    setDismissedAfterFirstPtt(true);
  }, []);

  useEffect(() => {
    if (sessionActive) {
      return;
    }
    setDismissedAfterFirstPtt(false);
    setIdleRemindVisible(false);
    hasUsedPttRef.current = false;
    lastActivityRef.current = Date.now();
  }, [sessionActive]);

  useEffect(() => {
    if (agentMode !== "ptt" || !sessionActive || !micOpen) {
      return;
    }
    if (!hasUsedPttRef.current) {
      hasUsedPttRef.current = true;
      setDismissedAfterFirstPtt(true);
    }
    lastActivityRef.current = Date.now();
    setIdleRemindVisible(false);
  }, [micOpen, agentMode, sessionActive]);

  useEffect(() => {
    if (!lastUserTranscript) {
      return;
    }
    lastActivityRef.current = Date.now();
    setIdleRemindVisible(false);
  }, [lastUserTranscript]);

  useEffect(() => {
    if (!lastCaption) {
      return;
    }
    lastActivityRef.current = Date.now();
    setIdleRemindVisible(false);
  }, [lastCaption]);

  useEffect(() => {
    if (agentMode !== "ptt" || !sessionActive || !dismissedAfterFirstPtt || micOpen || isConnecting) {
      return;
    }

    const tick = () => {
      setIdleRemindVisible(
        shouldShowIdleRemind(dismissedAfterFirstPtt, lastActivityRef.current, Date.now()),
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [agentMode, sessionActive, dismissedAfterFirstPtt, micOpen, isConnecting]);

  const showHoldToSpeakHint = computeShowHoldToSpeakHint({
    agentMode,
    sessionActive,
    isConnecting,
    micOpen,
    dismissedAfterFirstPtt,
    idleRemindVisible,
  });

  return { showHoldToSpeakHint, idleRemindVisible, bumpActivity };
}
