import { isButtonBridgeAvailable } from "@/button/config";
import { getAppMode } from "@/museum/appMode";
import { getPushToTalk } from "@/settings/councilSettings";

/** Museum Macs with push-to-talk: connect to the local USB bridge daemon. */
export function shouldAutoConnectButton(): boolean {
  return isMuseumButtonBridgeActive();
}

/** True when the app should talk to 127.0.0.1:8765 (health checks, WebSocket, LED). */
export function isMuseumButtonBridgeActive(): boolean {
  return (
    getAppMode() === "museum" &&
    getPushToTalk() &&
    isButtonBridgeAvailable()
  );
}
