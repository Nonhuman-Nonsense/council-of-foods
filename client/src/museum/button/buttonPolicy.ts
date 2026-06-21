import { getPushToTalk } from "@/settings/councilSettings";
import { isButtonBridgeAvailable } from "@/button/config";

/** Auto-connect the installation button when push-to-talk voice mode is enabled. */
export function shouldAutoConnectButton(): boolean {
  return getPushToTalk() && isButtonBridgeAvailable();
}
