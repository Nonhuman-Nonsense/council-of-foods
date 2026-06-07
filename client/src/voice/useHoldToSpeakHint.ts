import { useEffect, useRef, useState } from "react";
import { computeShowHoldToSpeakHint, shouldShowIdleRemind } from "./holdToSpeakHint";

export type UseHoldToSpeakHintParams = {
  pushToTalkMode: boolean;
  sessionActive: boolean;
  isConnecting: boolean;
  micOpen: boolean;
  lastUserTranscript: string | null;
  lastCaption: string | null;
};

/**
 * PTT hint visibility: show while the button is up until the first press,
 * then hide until a long idle period (no PTT, captions, or transcripts).
 */
export function useHoldToSpeakHint(params: UseHoldToSpeakHintParams): boolean {
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

  return computeShowHoldToSpeakHint({
    pushToTalkMode,
    sessionActive,
    isConnecting,
    micOpen,
    dismissedAfterFirstPtt,
    idleRemindVisible,
  });
}
