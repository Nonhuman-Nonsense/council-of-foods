const PUSH_TO_TALK_KEY = "councilPushToTalk";

export const PUSH_TO_TALK_CHANGE_EVENT = "council-push-to-talk-change";

export type PushToTalkChangeDetail = boolean;

export function getPushToTalk(): boolean {
  try {
    return localStorage.getItem(PUSH_TO_TALK_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPushToTalk(value: boolean): void {
  try {
    localStorage.setItem(PUSH_TO_TALK_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<PushToTalkChangeDetail>(PUSH_TO_TALK_CHANGE_EVENT, { detail: value }),
  );
}
