import { getPushToTalk } from "@/settings/councilSettings";
import { isWebSerialSupported } from "@/serial/transport";

/**
 * Whether the museum talk button should stay connected in the background.
 * Push-to-talk in localStorage is the feature flag; Web Serial must be available.
 */
export function shouldAutoConnectTalkButton(): boolean {
  return getPushToTalk() && isWebSerialSupported();
}
