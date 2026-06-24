import { useEffect } from "react";
import { isButtonBridgeAvailable } from "./config";
import { useCouncilSettings } from "@/settings/useCouncilSettings";
import { useButtonStore } from "./buttonStore";
import { useButtonLedDebugOverlay } from "./useButtonLedDebugOverlay";
import ButtonLedDebugOverlay from "./ButtonLedDebugOverlay";

/**
 * Push-to-talk button lifecycle: keyboard (Space) when PTT is enabled in any
 * app mode; hardware bridge only in museum mode when the bridge is available.
 */
export default function MuseumButtonProvider(): React.ReactElement | null {
  const { isMuseumMode, pushToTalkMode } = useCouncilSettings();
  const { ledDebugOverlay } = useButtonLedDebugOverlay();
  const bridgeActive = isMuseumMode && pushToTalkMode && isButtonBridgeAvailable();

  // Space-as-PTT works in web and museum whenever push-to-talk is on.
  useEffect(() => {
    if (!pushToTalkMode) {
      return;
    }
    useButtonStore.getState().init();
  }, [pushToTalkMode]);

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
