export const DEFAULT_BRIDGE_WS_URL = "ws://127.0.0.1:8765/v1/ptt";
export const DEFAULT_BRIDGE_HEALTH_URL = "http://127.0.0.1:8765/health";

const BRIDGE_URL_STORAGE_KEY = "councilPttBridgeUrl";

export function getBridgeWsUrl(): string {
  try {
    const override = localStorage.getItem(BRIDGE_URL_STORAGE_KEY);
    if (override?.trim()) {
      return override.trim();
    }
  } catch {
    // ignore
  }
  return DEFAULT_BRIDGE_WS_URL;
}

export function isBridgeTransportAvailable(): boolean {
  return typeof WebSocket !== "undefined";
}
