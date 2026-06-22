export const DEFAULT_BUTTON_BRIDGE_WS_URL = "ws://127.0.0.1:8765/v1/button";
export const DEFAULT_BUTTON_BRIDGE_HEALTH_URL = "http://127.0.0.1:8765/health";

/** Mirrors bridge env BUTTON_RECONNECT_BASE_MS / BUTTON_RECONNECT_MAX_MS defaults. */
export const BUTTON_RECONNECT_BASE_MS = 500;
export const BUTTON_RECONNECT_MAX_MS = 10_000;
export const BUTTON_CONNECT_TIMEOUT_MS = 5_000;
export const BUTTON_WATCHDOG_INTERVAL_MS = 2_500;

const BRIDGE_URL_STORAGE_KEY = "councilButtonBridgeUrl";

export function getButtonBridgeWsUrl(): string {
  try {
    const override = localStorage.getItem(BRIDGE_URL_STORAGE_KEY);
    if (override?.trim()) {
      return override.trim();
    }
  } catch {
    // ignore
  }
  return DEFAULT_BUTTON_BRIDGE_WS_URL;
}

export function isButtonBridgeAvailable(): boolean {
  return typeof WebSocket !== "undefined";
}
