import { getPushToTalk } from "@/settings/councilSettings";
import { isBridgeTransportAvailable } from "@/ptt/bridgeConfig";

/**
 * Whether the museum talk button should stay connected in the background.
 * Push-to-talk in localStorage is the feature flag; WebSocket bridge must be available.
 */
export function shouldAutoConnectTalkButton(): boolean {
  return getPushToTalk() && isBridgeTransportAvailable();
}
