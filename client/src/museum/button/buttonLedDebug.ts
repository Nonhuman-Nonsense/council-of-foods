export const BUTTON_LED_DEBUG_STORAGE_KEY = "councilButtonLedDebug";

export const BUTTON_LED_DEBUG_CHANGE_EVENT = "council-button-led-debug-change";

export function getButtonLedDebugOverlay(): boolean {
  try {
    return localStorage.getItem(BUTTON_LED_DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setButtonLedDebugOverlay(enabled: boolean): void {
  try {
    localStorage.setItem(BUTTON_LED_DEBUG_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(BUTTON_LED_DEBUG_CHANGE_EVENT, { detail: enabled }),
  );
}
