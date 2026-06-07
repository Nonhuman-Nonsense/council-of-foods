/** How long to wait after activity before nudging again with the hint. */
export const PTT_IDLE_REMIND_MS = 10_000;

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
  idleRemindMs = PTT_IDLE_REMIND_MS,
): boolean {
  if (!dismissedAfterFirstPtt) {
    return false;
  }
  return nowMs - lastActivityMs >= idleRemindMs;
}
