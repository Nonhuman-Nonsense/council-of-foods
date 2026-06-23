export const APP_MODE_STORAGE_KEY = "councilAppMode";

export const APP_MODE_CHANGE_EVENT = "council-app-mode-change";

export type AppMode = "web" | "museum";

export const PUSH_TO_TALK_STORAGE_KEY = "councilPushToTalk";

export const PUSH_TO_TALK_CHANGE_EVENT = "council-push-to-talk-change";

export type PushToTalkChangeDetail = boolean;

export function getAppMode(): AppMode {
  try {
    return localStorage.getItem(APP_MODE_STORAGE_KEY) === "museum" ? "museum" : "web";
  } catch {
    return "web";
  }
}

export function setAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(new CustomEvent<AppMode>(APP_MODE_CHANGE_EVENT, { detail: mode }));
}

export function getPushToTalk(): boolean {
  try {
    return localStorage.getItem(PUSH_TO_TALK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPushToTalk(value: boolean): void {
  try {
    localStorage.setItem(PUSH_TO_TALK_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<PushToTalkChangeDetail>(PUSH_TO_TALK_CHANGE_EVENT, { detail: value }),
  );
}
