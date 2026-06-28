import { useEffect, useRef, useState } from "react";

/** How long to wait after activity before nudging again with the hint. */
export const BUTTON_IDLE_REMIND_MS = 10_000;

export function computeShowHoldToSpeakHint(params: {
  pushToTalkMode: boolean;
  sessionActive: boolean;
  isConnecting: boolean;
  micOpen: boolean;
  dismissedAfterFirstPtt: boolean;
  idleRemindVisible: boolean;
}): boolean {
  if (!params.pushToTalkMode || !params.sessionActive || params.isConnecting || params.micOpen) {
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
  pushToTalkMode: boolean;
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
};

/**
 * PTT hint visibility: show while the button is up until the first press,
 * then hide until a long idle period (no PTT, captions, or transcripts).
 */
export function useHoldToSpeakHint(params: UseHoldToSpeakHintParams): HoldToSpeakHintState {
  const {
    pushToTalkMode,
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
    if (!pushToTalkMode || !sessionActive || !micOpen) {
      return;
    }
    if (!hasUsedPttRef.current) {
      hasUsedPttRef.current = true;
      setDismissedAfterFirstPtt(true);
    }
    lastActivityRef.current = Date.now();
    setIdleRemindVisible(false);
  }, [micOpen, pushToTalkMode, sessionActive]);

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
    if (!pushToTalkMode || !sessionActive || !dismissedAfterFirstPtt || micOpen || isConnecting) {
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
  }, [pushToTalkMode, sessionActive, dismissedAfterFirstPtt, micOpen, isConnecting]);

  const showHoldToSpeakHint = computeShowHoldToSpeakHint({
    pushToTalkMode,
    sessionActive,
    isConnecting,
    micOpen,
    dismissedAfterFirstPtt,
    idleRemindVisible,
  });

  return { showHoldToSpeakHint, idleRemindVisible };
}
