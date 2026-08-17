import { useEffect } from "react";
import { isButtonBridgeAvailable } from "./buttonBridge";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useButtonStore } from "./buttonStore";
import ButtonLedDebugOverlay, { useButtonLedDebugOverlay } from "./buttonDebug";

/**
 * Push-to-talk lifecycle. Space is bound in both app modes — whether a press
 * counts is decided by whether an owner has armed the button, not here. The
 * hardware bridge is a separate staff setting, usable in web mode so a laptop
 * can drive a real button for testing.
 */
export default function MuseumButton(): React.ReactElement | null {
  const { pttHardwareEnabled } = useCouncilSettings();
  const { ledDebugOverlay } = useButtonLedDebugOverlay();
  const bridgeActive = pttHardwareEnabled && isButtonBridgeAvailable();

  useEffect(() => {
    useButtonStore.getState().init();
  }, []);

  useEffect(() => {
    if (!bridgeActive) {
      void useButtonStore.getState().disconnect();
      return;
    }

    const store = useButtonStore.getState();
    store.enableAutoReconnect();
    void store.connect();

    function onVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void useButtonStore.getState().connect();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void useButtonStore.getState().disconnect();
    };
  }, [bridgeActive]);

  return ledDebugOverlay ? <ButtonLedDebugOverlay /> : null;
}
